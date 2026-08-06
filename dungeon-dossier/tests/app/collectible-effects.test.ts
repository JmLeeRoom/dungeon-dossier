import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { createEncounterSession } from '../../src/app/createEncounterSession';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  EnhancementsSchema,
  RelicsSchema,
} from '../../src/content-io';
import { createRunState } from '../../src/engine/run';

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('owned relic and enhancement encounter effects', () => {
  it('applies encounter-start and compatible resolution effects with use limits', async () => {
    const [caseDefinition, cardsDefinition, balance, relics, enhancements] =
      await Promise.all([
        content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
        content('common/cards.json').then((value) => CardsSchema.parse(value)),
        content('common/balance.json').then((value) => BalanceSchema.parse(value)),
        content('common/relics.json').then((value) => RelicsSchema.parse(value)),
        content('common/enhancements.json').then((value) =>
          EnhancementsSchema.parse(value),
        ),
      ]);
    const caseWithCpHeadroom = CaseSchema.parse({
      ...caseDefinition,
      encounters: caseDefinition.encounters.map((encounter) =>
        encounter.encounter_id === 'enc_tutorial_slime'
          ? {
              ...encounter,
              resources: { ...encounter.resources, cp_max: 4 },
            }
          : encounter,
      ),
    });
    const runState = createRunState({
      runSeed: 20260805,
      stress: 60,
      dp: 0,
      trust: 0,
      deck: {
        drawPile: Array.from({ length: 8 }, () => 'card_contradict_basic'),
        hand: [],
        discardPile: [],
        exhaustPile: [],
      },
      acquiredRelicIds: ['relic_clean_notebook', 'relic_sealed_badge'],
      acquiredEnhancementIds: [
        'enh_stamp_blue',
        'enh_stamp_red',
        'enh_postit_time',
        'enh_clip_commit',
      ],
    });
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseWithCpHeadroom },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runState,
      relicDefinitions: relics.relics,
      enhancementDefinitions: enhancements.enhancements,
      extraInitialEffects: [
        { type: 'ADJUST_RESOURCE', resource: 'coercion', delta: 10 },
      ],
    });
    const coordinator = session.coordinator;

    // Clean Notebook is an owned ENCOUNTER_START relic: 3 turn CP + 1 relic CP.
    expect(coordinator.snapshot.resources.commandPoints).toBe(4);
    expect(coordinator.snapshot.resources.coercion).toBe(10);

    const submitContradiction = () => coordinator.submit({
      cardId: 'card_contradict_basic',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });

    coordinator.beginArgument();
    const first = submitContradiction();
    expect(coordinator.snapshot.resources.composure).toBe(
      Math.max(0, 60 + first.resolution.effects.composureDelta - 2),
    );
    expect(coordinator.snapshot.resources.coercion).toBe(
      Math.max(0, 10 + first.resolution.effects.coercionDelta - 3),
    );
    expect(coordinator.snapshot.resolutionEffectActivations).toEqual({
      relic_sealed_badge: 1,
      enh_stamp_blue: 1,
      enh_stamp_red: 1,
    });

    if (coordinator.snapshot.machine.state === 'CHECK_OUTCOME') {
      coordinator.endTurn();
    }
    coordinator.beginArgument();
    const coercionBeforeSecond = coordinator.snapshot.resources.coercion;
    const second = submitContradiction();
    expect(coordinator.snapshot.resources.coercion).toBe(
      Math.max(0, coercionBeforeSecond + second.resolution.effects.coercionDelta - 1),
    );
    expect(coordinator.snapshot.resolutionEffectActivations).toEqual({
      relic_sealed_badge: 1,
      enh_stamp_blue: 2,
      enh_stamp_red: 2,
    });
  });

  it('does not fire enhancements outside their authored card and intent compatibility', async () => {
    const [caseDefinition, cardsDefinition, balance, enhancements] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/enhancements.json').then((value) =>
        EnhancementsSchema.parse(value),
      ),
    ]);
    const createSessionFor = async (cardId: string) => createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runState: createRunState({
        runSeed: 19,
        stress: 60,
        dp: 0,
        trust: 0,
        deck: {
          drawPile: Array.from({ length: 6 }, () => cardId),
          hand: [],
          discardPile: [],
          exhaustPile: [],
        },
        acquiredEnhancementIds: enhancements.enhancements.map(
          (enhancement) => enhancement.enhancement_id,
        ),
      }),
      enhancementDefinitions: enhancements.enhancements,
    });

    const query = await createSessionFor('card_query_when');
    query.coordinator.beginArgument();
    query.coordinator.submit({
      cardId: 'card_query_when',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: [],
    });
    expect(query.coordinator.snapshot.resolutionEffectActivations).toEqual({
      enh_postit_time: 1,
    });

    const commit = await createSessionFor('card_commit_clip');
    commit.coordinator.beginArgument();
    commit.coordinator.submit({
      cardId: 'card_commit_clip',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: [],
    });
    expect(commit.coordinator.snapshot.claims.clm_tutorial_when?.commitment)
      .toBe('COMMITTED');
    expect(commit.coordinator.snapshot.resolutionEffectActivations).toEqual({
      enh_clip_commit: 1,
    });
  });
});
