import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  FlagsSchema,
} from '../../src/content-io';
import { createEncounterSession } from '../../src/app/createEncounterSession';
import {
  createInitialGameRunState,
  encounterGradeMetrics,
  encounterRunProjection,
  endingIdForRun,
  endingKindForRun,
  rewardRarityForOutcome,
} from '../../src/app/gameRunState';

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('production game run state adapters', () => {
  it('creates the authored starting deck/resources/flag defaults', async () => {
    const [cards, balance, flags] = await Promise.all([
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
    ]);

    const state = createInitialGameRunState(cards, balance, flags, 77);

    expect(state.runSeed).toBe(77);
    expect(state.stress).toBe(balance.stress.max);
    expect(state.dp).toBe(balance.dp.initial);
    expect(state.deck.drawPile).toHaveLength(
      cards.cards.reduce((total, card) => total + card.starting_copies, 0),
    );
    expect(Object.keys(state.flags)).toHaveLength(13);
    expect(Object.values(state.flags).every((value) => value === false)).toBe(true);
  });

  it('projects coordinator resources/deck/acquired evidence and derives grade metrics', async () => {
    const [caseDefinition, cards, balance, flags] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
    ]);
    const runState = createInitialGameRunState(cards, balance, flags, 81);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cards },
      balanceRepository: { reload: async () => balance },
      runState,
      flagDefinitions: flags.flags,
      runSeed: 81,
    });

    const projection = encounterRunProjection(session, runState);
    const metrics = encounterGradeMetrics(session);

    expect(projection).toMatchObject({
      stress: session.coordinator.snapshot.resources.stress,
      dp: session.coordinator.snapshot.resources.dp,
      trust: session.coordinator.snapshot.resources.trust,
    });
    expect([
      ...projection.deck.drawPile,
      ...projection.deck.hand,
      ...projection.deck.discardPile,
    ]).toHaveLength(runState.deck.drawPile.length);
    expect(projection.deck.exhaustPile).toEqual(runState.deck.exhaustPile);
    expect(projection.acquiredEvidenceIds).toEqual(
      Object.entries(session.coordinator.snapshot.evidence).flatMap(
        ([evidenceId, evidence]) => evidence.acquired ? [evidenceId] : [],
      ),
    );
    expect(metrics.requiredClaimResolutionRatio).toBe(0);
    expect(metrics.optionalObjectiveRatio).toBe(0);
    expect(metrics.coercion).toBe(0);
  });

  it('uses boolean F-13 for true, a failed terminal outcome for bad, and normal otherwise', async () => {
    const [cards, balance, flags] = await Promise.all([
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
    ]);
    const normal = createInitialGameRunState(cards, balance, flags, 9);
    const bad = {
      ...normal,
      terminal: true,
      outcomeHistory: [{ nodeId: 'run_tutorial_01', outcome: 'FAILED' as const }],
    };
    const falseConfession = { ...normal, falseConfessions: 1 };
    const truth = {
      ...bad,
      flags: { ...bad.flags, 'F-13': true },
    };
    const cleanTruth = {
      ...normal,
      flags: { ...normal.flags, 'F-13': true },
    };

    expect(endingKindForRun(normal)).toBe('NORMAL');
    expect(endingIdForRun(normal)).toBe('ending-normal');
    expect(endingKindForRun(bad)).toBe('BAD');
    expect(endingKindForRun(falseConfession)).toBe('BAD');
    expect(endingIdForRun(truth)).toBe('ending-bad');
    expect(endingIdForRun(cleanTruth)).toBe('ending-true');
  });

  it('maps authored acts and bosses across every checked-in reward tier', () => {
    expect(rewardRarityForOutcome('BEST_RESOLUTION', 0, false)).toBe('COMMON');
    expect(rewardRarityForOutcome('PARTIAL_RESOLUTION', 1, false)).toBe('UNCOMMON');
    expect(rewardRarityForOutcome('BEST_RESOLUTION', 1, true)).toBe('CASE');
    expect(rewardRarityForOutcome('BEST_RESOLUTION', 4, false)).toBe('RARE');
    expect(rewardRarityForOutcome('BEST_RESOLUTION', 4, true)).toBe('LEGENDARY');
  });
});
