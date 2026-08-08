import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  FlagsSchema,
  RunStripSchema,
  StringsSchema,
} from '../../src/content-io';
import { hasForbiddenPublicKey } from '../../src/dto';
import { serializeJudgmentLog } from '../../src/engine/log';
import { createRunState } from '../../src/engine/run';
import { createEncounterSession } from '../../src/app/createEncounterSession';
import { clearStrings, installStrings } from '../../src/app/i18n';

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

const RAW_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/u;

describe('encounter app session', () => {
  it('loads validated real content and derives the interrogation model from coordinator state', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runSeed: 2_026_080_3,
    });

    const model = session.currentModel();
    expect(session.encounterId).toBe('enc_tutorial_slime');
    expect(session.targetClaimIdForFacet('WHEN')).toBe('clm_tutorial_when');
    expect(model.dto.statement.map((claim) => claim.claimId)).toEqual([
      'clm_tutorial_who',
      'clm_tutorial_when',
      'clm_tutorial_slime_where',
      'clm_tutorial_slime_what',
      'clm_tutorial_slime_how',
      'clm_tutorial_slime_why',
    ]);
    expect(model.cards.map((card) => card.cardId)).toEqual(
      session.coordinator.snapshot.deck.hand,
    );
    expect(model.suspectName).toBe('물컹이');
    expect(model.backgroundAssetKey).toBe('배경/심문실/시안');
    expect(model.portraitBaseAssetKey).toBe('portrait/물컹이/base');
    expect(model.portraitStatePartsAssetKeys).toEqual({
      base: model.portraitBaseAssetKey,
      upset: 'portrait/물컹이/upset',
      lose: 'portrait/물컹이/lose',
    });
    expect(model.suspectStatePart).toBe('base');
    expect(model.partnerCooldown).toEqual({ state: 'base', cooldownTurns: 0 });
    // Partner skill is live now that balance.json ships a configured cooldown (U-1).
    expect(model.partnerSkillAvailable).toBe(true);
    expect(hasForbiddenPublicKey(model.dto)).toBe(false);
    expect(session.fallbackCatalog.statements.clm_tutorial_when).toHaveLength(1);
    expect(session.fallbackCatalog.reactions.R_DIRECT_CONTRADICTION).toHaveLength(1);
    expect(session.fallbackCatalog.reactions.MISSING_PROOF_RULE).toHaveLength(1);
  });

  it('localizes every player-facing interrogation model field', async () => {
    const [caseDefinition, cardsDefinition, balance, strings] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/strings.ko.json').then((value) => StringsSchema.parse(value)),
    ]);
    installStrings(strings.strings);
    try {
      const session = await createEncounterSession({
        caseRepository: { load: async () => caseDefinition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        runSeed: 2_026_080_3,
      });
      const model = session.currentModel();

      expect(model.cards.every((card) => !RAW_KEY_PATTERN.test(card.title))).toBe(true);
      expect(model.cards.every((card) => !RAW_KEY_PATTERN.test(card.description))).toBe(true);
      expect(model.dto.objectives[0]?.label).toBe('퇴근 시각 진술의 모순을 입증한다.');
      expect(model.dto.evidence.every((item) => !RAW_KEY_PATTERN.test(item.displayName)))
        .toBe(true);
      const displayedStrings = [
        model.suspectName,
        model.partnerName,
        ...model.cards.flatMap((card) => [card.title, card.description]),
        ...model.dto.statement.map((statement) => statement.text),
        ...model.dto.evidence.map((item) => item.displayName),
        ...model.dto.objectives.map((objective) => objective.label),
      ];
      expect(displayedStrings.filter((value) => RAW_KEY_PATTERN.test(value))).toEqual([]);
    } finally {
      clearStrings();
    }
  });

  it('G-C1/G-C2 completes the authored tutorial encounter and replays byte-identically', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const play = async (): Promise<string> => {
      const session = await createEncounterSession({
        caseRepository: { load: async () => caseDefinition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        runSeed: 77,
      });
      const coordinator = session.coordinator;
      expect(coordinator.snapshot.deck.hand).toHaveLength(5);
      const request = {
        cardId: 'card_contradict_basic',
        targetClaimId: 'clm_tutorial_when',
        evidenceIds: ['ev_tutorial_gate_log'],
      } as const;

      coordinator.beginArgument();
      const first = coordinator.submit(request);
      expect(first.resolution.code).toBe('R_DIRECT_CONTRADICTION');
      expect(first.outcome.bestResolution.secureStatementEnabled).toBe(false);
      expect(coordinator.snapshot.deck.discardPile).toContain('card_contradict_basic');
      coordinator.endTurn();
      coordinator.beginArgument();
      const query = coordinator.submit({
        cardId: 'card_query_when',
        targetClaimId: 'clm_tutorial_when',
        evidenceIds: [],
      });
      expect(query.resolution.code).toBe('R_QUERY_SUCCESS');
      expect(coordinator.snapshot.usedRouteIds).toContain('route_tutorial_when');
      expect(coordinator.snapshot.openRouteIds).toContain('route_tutorial_slime_how');
      coordinator.endTurn();
      expect(coordinator.snapshot.deck.hand).toContain('card_contradict_basic');
      coordinator.beginArgument();
      const second = coordinator.submit(request);
      expect(second.resolution.code).toBe('R_DIRECT_CONTRADICTION');
      expect(second.outcome.bestResolution.secureStatementEnabled).toBe(false);
      coordinator.endTurn();
      while (!coordinator.snapshot.deck.hand.includes('card_contradict_basic')) {
        const cardId = coordinator.snapshot.deck.hand[0];
        if (cardId === undefined) throw new Error('Expected a playable card while cycling the deck.');
        coordinator.beginArgument();
        coordinator.submit({ cardId, evidenceIds: [] });
        coordinator.endTurn();
      }
      coordinator.beginArgument();
      const third = coordinator.submit(request);
      expect(third.resolution.code).toBe('R_DIRECT_CONTRADICTION');
      expect(third.outcome.bestResolution.secureStatementEnabled).toBe(true);
      expect(coordinator.secureStatement().terminalOutcome).toBe('BEST_RESOLUTION');
      expect(session.currentModel().suspectStatePart).toBe('lose');
      expect(hasForbiddenPublicKey(session.currentModel().dto)).toBe(false);
      return serializeJudgmentLog(coordinator.snapshot.log);
    };

    expect(await play()).toBe(await play());
  });

  it('applies validated balance changes to the active encounter without restarting it', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runSeed: 77,
    });
    const tuned = structuredClone(balance);
    tuned.dmg.contradict = 25;
    tuned.sweetSpot = { min: 10, max: 20 };
    tuned.overrides.byEncounter.enc_tutorial_slime = {
      composureMax: 75,
      coercionLimit: 55,
    };

    session.applyBalance(tuned);

    expect(session.balance).toBe(tuned);
    expect(session.coordinator.snapshot.resources.turn).toBe(1);
    expect(session.currentModel()).toMatchObject({
      composureMax: 75,
      coercionMax: 55,
      sweetSpotMin: 7.5,
      sweetSpotMax: 15,
    });
    session.coordinator.beginArgument();
    const result = session.coordinator.submit({
      cardId: 'card_contradict_basic',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });

    expect(result.resolution.effects.composureDelta).toBe(-25);
    expect(session.coordinator.snapshot.resources.composure).toBe(35);
  });

  it('projects a configured partner cooldown as used until turn-start ticks reach zero', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const configured = structuredClone(balance);
    configured.partner.cooldowns.partner_runtime = 2;
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => configured },
      partnerSkillId: 'partner_runtime',
      runSeed: 77,
    });

    expect(session.currentModel().partnerSkillAvailable).toBe(true);
    expect(session.usePartnerSkill()).toEqual({ state: 'used', cooldownTurns: 2 });
    expect(session.currentModel().partnerCooldown).toEqual({
      state: 'used',
      cooldownTurns: 2,
    });

    session.coordinator.beginArgument();
    session.coordinator.submit({
      cardId: 'card_contradict_basic',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });
    session.coordinator.endTurn();
    expect(session.currentModel().partnerCooldown).toEqual({
      state: 'used',
      cooldownTurns: 1,
    });

    session.coordinator.beginArgument();
    session.coordinator.submit({
      cardId: 'card_query_when',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: [],
    });
    session.coordinator.endTurn();
    expect(session.currentModel().partnerCooldown).toEqual({
      state: 'base',
      cooldownTurns: 0,
    });
  });

  it('carries run resources, deck, evidence, and consumed flag effects into the next encounter', async () => {
    const [caseDefinition, cardsDefinition, balance, flags] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
    ]);
    const cardIds = cardsDefinition.cards.flatMap((card) =>
      Array.from({ length: card.starting_copies }, () => card.card_id),
    );
    const runState = createRunState({
      runSeed: 71,
      stress: 60,
      dp: 7,
      trust: 0,
      deck: { drawPile: cardIds, hand: [], discardPile: [], exhaustPile: [] },
      flags: { 'F-02': true, 'F-03': true },
      acquiredEvidenceIds: ['ev_tutorial_receipt'],
    });
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      encounterId: 'enc_tutorial_harpy',
      runState,
      flagDefinitions: flags.flags,
    });

    expect(session.coordinator.snapshot.resources).toMatchObject({
      stress: 60,
      dp: 7,
      trust: 1,
    });
    expect(session.coordinator.snapshot.deck.hand).toHaveLength(5);
    expect(session.coordinator.snapshot.evidence.ev_tutorial_receipt?.acquired).toBe(true);
    expect(session.coordinator.snapshot.evidence.ev_tutorial_corridor_photo?.acquired)
      .toBe(true);
  });

  it('applies every enabled authored flag consumer across all nine real encounters', async () => {
    const [cardsDefinition, balance, flags, stripDefinition] = await Promise.all([
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
      content('common/run-strip.json').then((value) => RunStripSchema.parse(value)),
    ]);
    const definitions = Object.fromEntries(await Promise.all(
      ['tutorial', 'ep001', 'ep004'].map(async (directory) => [
        directory,
        CaseSchema.parse(await content(`cases/${directory}/case.json`)),
      ] as const),
    ));
    const cardIds = cardsDefinition.cards.flatMap((card) =>
      Array.from({ length: card.starting_copies }, () => card.card_id),
    );
    const runState = createRunState({
      runSeed: 91,
      stress: 80,
      dp: 5,
      trust: 0,
      deck: { drawPile: cardIds, hand: [], discardPile: [], exhaustPile: [] },
      flags: Object.fromEntries(flags.flags.map((flag) => [flag.flag_id, true])),
    });
    // Driven by the authored catalogue, not the resolved route: a route that
    // stops visiting an encounter must not silently drop it from this gate.
    const authoredEncounters = Object.entries(definitions).flatMap(
      ([caseDirectory, definition]) =>
        definition.encounters.map((encounter) => ({
          caseDirectory,
          encounterId: encounter.encounter_id,
        })),
    );

    for (const node of authoredEncounters) {
      const definition = definitions[node.caseDirectory];
      if (definition === undefined) throw new Error(`Missing case ${node.caseDirectory}.`);
      const session = await createEncounterSession({
        caseRepository: { load: async () => definition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        encounterId: node.encounterId,
        runState,
        flagDefinitions: flags.flags,
      });
      expect(hasForbiddenPublicKey(session.currentModel().dto)).toBe(false);
      expect(session.coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    }
    expect(authoredEncounters.map((node) => node.encounterId)).toEqual([
      'enc_tutorial_slime',
      'enc_tutorial_harpy',
      'enc_tutorial_minotaur',
      'enc_ep001_goblin',
      'enc_ep001_orc',
      'enc_ep001_succubus',
      'enc_ep004_dwarf',
      'enc_ep004_cyclops',
      'enc_ep004_fallen_hero',
    ]);
    expect(authoredEncounters).toHaveLength(9);

    // …and the catalogue must still cover every encounter the strip can route.
    const routableEncounterRefs = stripDefinition.episodes.flatMap((episode) =>
      episode.slots
        .filter((slot) => slot.role !== 'EVENT')
        .flatMap((slot) => slot.candidates.map((candidate) => candidate.ref)),
    );
    expect(routableEncounterRefs.length).toBeGreaterThan(0);
    const covered = new Set(authoredEncounters.map((node) => node.encounterId));
    expect(routableEncounterRefs.filter((ref) => !covered.has(ref))).toEqual([]);
  });
});
