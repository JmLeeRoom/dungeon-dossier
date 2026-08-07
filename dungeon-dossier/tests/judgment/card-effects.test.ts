import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { createEncounterSession, type EncounterSession } from '../../src/app/createEncounterSession';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  type BalanceDefinition,
  type CardsDefinition,
  type CaseDefinition,
} from '../../src/content-io';
import type { Effect } from '../../src/engine/domain';
import {
  RUNTIME_SELECTED_CLAIM,
  RUNTIME_SELECTED_EVIDENCE,
} from '../../src/engine/encounter';
import { createRunState } from '../../src/engine/run';

const TARGET_CLAIM_ID = 'clm_tutorial_when';
const TARGET_EVIDENCE_ID = 'ev_tutorial_gate_log';

/** The nine effect types `#applyEncounterEffect` implements; the rest throw. */
const RUNTIME_SUPPORTED_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'ADJUST_RESOURCE',
  'REDUCE_CP',
  'GRANT_EVIDENCE',
  'UPGRADE_EVIDENCE',
  'OPEN_ROUTE',
  'DRAW_CARD',
  'MODIFY_SHIELDS',
  'REVEAL_CLAIMS',
  'SET_CLAIM_STATE',
]);

interface Fixtures {
  readonly caseDefinition: CaseDefinition;
  readonly cards: CardsDefinition;
  readonly balance: BalanceDefinition;
}

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

async function fixtures(): Promise<Fixtures> {
  const [caseDefinition, cards, balance] = await Promise.all([
    content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
    content('common/cards.json').then((value) => CardsSchema.parse(value)),
    content('common/balance.json').then((value) => BalanceSchema.parse(value)),
  ]);
  return { caseDefinition, cards, balance };
}

/**
 * Rewrites one catalogue card's modifiers so a single effect vocabulary can be
 * exercised end to end without the assertion depending on shipped authoring.
 */
function withCardModifiers(
  cards: CardsDefinition,
  cardId: string,
  modifiers: readonly Effect[],
): CardsDefinition {
  return CardsSchema.parse({
    ...cards,
    cards: cards.cards.map((card) =>
      card.card_id === cardId ? { ...card, modifiers } : card,
    ),
  });
}

async function createSession(
  base: Fixtures,
  cards: CardsDefinition,
  deckCardId: string,
  extraInitialEffects: readonly Effect[] = [],
): Promise<EncounterSession> {
  return createEncounterSession({
    caseRepository: { load: async () => base.caseDefinition },
    cardRepository: { load: async () => cards },
    balanceRepository: { reload: async () => base.balance },
    runState: createRunState({
      runSeed: 20_260_807,
      stress: 60,
      dp: 0,
      trust: 0,
      deck: {
        drawPile: Array.from({ length: 8 }, () => deckCardId),
        hand: [],
        discardPile: [],
        exhaustPile: [],
      },
    }),
    extraInitialEffects,
  });
}

describe('played card modifiers reach encounter state', () => {
  it('applies a resource adjustment on top of the resolution effects', async () => {
    const base = await fixtures();
    const session = await createSession(
      base,
      withCardModifiers(base.cards, 'card_recover_breathe', [
        { type: 'ADJUST_RESOURCE', resource: 'coercion', delta: -4 },
      ]),
      'card_recover_breathe',
      [{ type: 'ADJUST_RESOURCE', resource: 'coercion', delta: 12 }],
    );
    const coordinator = session.coordinator;
    expect(coordinator.snapshot.resources.coercion).toBe(12);

    coordinator.beginArgument();
    const result = coordinator.submit({
      cardId: 'card_recover_breathe',
      targetClaimId: TARGET_CLAIM_ID,
      evidenceIds: [],
    });

    // R_RECOVER_APPLIED carries no resolution deltas of its own, so the entire
    // change has to come from the card's authored modifier.
    expect(result.resolution.code).toBe('R_RECOVER_APPLIED');
    expect(result.resolution.effects.coercionDelta).toBe(0);
    expect(coordinator.snapshot.resources.coercion).toBe(8);
  });

  it('binds the selected-claim sentinel and commits the submitted claim', async () => {
    const base = await fixtures();
    const session = await createSession(
      base,
      withCardModifiers(base.cards, 'card_recover_breathe', [
        { type: 'SET_CLAIM_STATE', target: RUNTIME_SELECTED_CLAIM, value: 'COMMITTED' },
      ]),
      'card_recover_breathe',
    );
    const coordinator = session.coordinator;
    expect(coordinator.snapshot.claims[TARGET_CLAIM_ID]?.commitment).not.toBe('COMMITTED');

    coordinator.beginArgument();
    coordinator.submit({
      cardId: 'card_recover_breathe',
      targetClaimId: TARGET_CLAIM_ID,
      evidenceIds: [],
    });

    expect(coordinator.snapshot.claims[TARGET_CLAIM_ID]?.commitment).toBe('COMMITTED');
  });

  it('expands the selected-evidence sentinel into the submitted evidence ids', async () => {
    const base = await fixtures();
    const session = await createSession(
      base,
      withCardModifiers(base.cards, 'card_confirm_basic', [
        { type: 'UPGRADE_EVIDENCE', targets: [RUNTIME_SELECTED_EVIDENCE] },
      ]),
      'card_confirm_basic',
    );
    const coordinator = session.coordinator;
    const before = coordinator.snapshot.evidence[TARGET_EVIDENCE_ID]?.grade;
    const upgrades =
      base.caseDefinition.evidence.find(
        (evidence) => evidence.evidence_id === TARGET_EVIDENCE_ID,
      )?.grade.upgrades ?? [];

    coordinator.beginArgument();
    coordinator.submit({
      cardId: 'card_confirm_basic',
      targetClaimId: TARGET_CLAIM_ID,
      evidenceIds: [TARGET_EVIDENCE_ID],
    });

    // Without sentinel expansion the effect would see zero targets and the
    // grade could never move, so an authored upgrade path proves the binding.
    const after = coordinator.snapshot.evidence[TARGET_EVIDENCE_ID]?.grade;
    expect(after).toBe(upgrades.length > 0 ? upgrades[0]?.to : before);
  });

  it('never lets the evidence sentinel reach evidence the resolver rejected', async () => {
    const base = await fixtures();
    const unowned = base.caseDefinition.evidence.find(
      (evidence) =>
        evidence.evidence_id !== TARGET_EVIDENCE_ID && evidence.grade.upgrades.length > 0,
    );
    if (unowned === undefined) throw new Error('Tutorial case needs an upgradable evidence item.');
    const session = await createSession(
      base,
      withCardModifiers(base.cards, 'card_confirm_basic', [
        { type: 'UPGRADE_EVIDENCE', targets: [RUNTIME_SELECTED_EVIDENCE] },
      ]),
      'card_confirm_basic',
    );
    const coordinator = session.coordinator;
    // Not acquired, so `#resolveSubmission` drops it before the resolver sees
    // it; the sentinel must drop it too or a card could upgrade evidence the
    // player does not even hold.
    expect(coordinator.snapshot.evidence[unowned.evidence_id]?.acquired).toBe(false);
    const before = coordinator.snapshot.evidence[unowned.evidence_id]?.grade;

    coordinator.beginArgument();
    coordinator.submit({
      cardId: 'card_confirm_basic',
      targetClaimId: TARGET_CLAIM_ID,
      evidenceIds: [TARGET_EVIDENCE_ID, unowned.evidence_id],
    });

    expect(coordinator.snapshot.evidence[unowned.evidence_id]?.grade).toBe(before);
    expect(coordinator.snapshot.evidence[unowned.evidence_id]?.acquired).toBe(false);
  });

  it('grants evidence and reveals claims through card modifiers', async () => {
    const base = await fixtures();
    const other = base.caseDefinition.evidence.find(
      (evidence) => evidence.evidence_id !== TARGET_EVIDENCE_ID,
    );
    if (other === undefined) throw new Error('Tutorial case needs a second evidence item.');
    const session = await createSession(
      base,
      withCardModifiers(base.cards, 'card_recover_breathe', [
        { type: 'GRANT_EVIDENCE', target: other.evidence_id },
        { type: 'REVEAL_CLAIMS', target: RUNTIME_SELECTED_CLAIM },
      ]),
      'card_recover_breathe',
    );
    const coordinator = session.coordinator;

    coordinator.beginArgument();
    coordinator.submit({
      cardId: 'card_recover_breathe',
      targetClaimId: TARGET_CLAIM_ID,
      evidenceIds: [],
    });

    expect(coordinator.snapshot.evidence[other.evidence_id]?.acquired).toBe(true);
    expect(coordinator.snapshot.revealedIds).toContain(TARGET_CLAIM_ID);
  });

  it('never applies card modifiers when the action itself is invalid', async () => {
    const base = await fixtures();
    const session = await createSession(
      base,
      withCardModifiers(base.cards, 'card_confirm_basic', [
        { type: 'ADJUST_RESOURCE', resource: 'coercion', delta: -5 },
      ]),
      'card_confirm_basic',
      [{ type: 'ADJUST_RESOURCE', resource: 'coercion', delta: 20 }],
    );
    const coordinator = session.coordinator;
    const commandPointsBefore = coordinator.snapshot.resources.commandPoints;

    coordinator.beginArgument();
    // min_evidence is 1, so submitting with no evidence is R_ACTION_INVALID.
    const result = coordinator.submit({
      cardId: 'card_confirm_basic',
      targetClaimId: TARGET_CLAIM_ID,
      evidenceIds: [],
    });

    expect(result.resolution.code).toBe('R_ACTION_INVALID');
    expect(result.resolution.effects.cardEffects).toEqual([]);
    expect(coordinator.snapshot.resources.coercion).toBe(20);
    expect(coordinator.snapshot.resources.commandPoints).toBe(commandPointsBefore);
  });
});

describe('shipped card catalogue authoring', () => {
  it('gives every action-family card a mechanical effect the resolver cannot supply', async () => {
    const { cards } = await fixtures();
    // R_PRESSURE_APPLIED / R_RECOVER_APPLIED / R_FORENSIC_REVEALED /
    // R_SPECIAL_APPLIED all resolve with zero effects, so those intents are
    // pure CP sinks unless the card authors its own modifiers.
    const effectlessIntents = new Set(['PRESSURE', 'RECOVER', 'FORENSIC', 'SPECIAL']);
    const inert = cards.cards
      .filter((card) => effectlessIntents.has(card.intent) && card.modifiers.length === 0)
      .map((card) => card.card_id);
    expect(inert).toEqual([]);
  });

  it('only authors effect types the encounter runtime can actually apply', async () => {
    const { cards } = await fixtures();
    const unsupported = cards.cards.flatMap((card) =>
      card.modifiers
        .filter((effect) => !RUNTIME_SUPPORTED_EFFECT_TYPES.has(effect.type))
        .map((effect) => `${card.card_id}:${effect.type}`),
    );
    expect(unsupported).toEqual([]);
  });

  it('resolves every authored runtime sentinel to a known binding', async () => {
    const { cards } = await fixtures();
    const known: ReadonlySet<string> = new Set([
      RUNTIME_SELECTED_CLAIM,
      RUNTIME_SELECTED_EVIDENCE,
    ]);
    const unknown = cards.cards.flatMap((card) =>
      card.modifiers
        .flatMap((effect) => [
          ...(effect.target === undefined ? [] : [effect.target]),
          ...(effect.targets ?? []),
        ])
        .filter((target) => target.startsWith('runtime-') && !known.has(target)),
    );
    expect(unknown).toEqual([]);
  });

  it('plays every shipped card modifier against the tutorial encounter without throwing', async () => {
    const base = await fixtures();
    const authored = base.cards.cards.filter((card) => card.modifiers.length > 0);
    expect(authored.length).toBeGreaterThan(0);

    for (const card of authored) {
      const session = await createSession(base, base.cards, card.card_id, [
        { type: 'ADJUST_RESOURCE', resource: 'cp', delta: 6 },
      ]);
      const coordinator = session.coordinator;
      coordinator.beginArgument();
      const submit = (): unknown =>
        coordinator.submit({
          cardId: card.card_id,
          targetClaimId: TARGET_CLAIM_ID,
          evidenceIds: (card.target.min_evidence ?? 0) > 0 ? [TARGET_EVIDENCE_ID] : [],
        });
      expect(submit, `${card.card_id} must survive a live submission`).not.toThrow();
    }
  });
});
