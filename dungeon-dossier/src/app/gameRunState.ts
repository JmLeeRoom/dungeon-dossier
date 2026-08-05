import type {
  BalanceDefinition,
  CardsDefinition,
  FlagsDefinition,
} from '../content-io';
import type { EncounterOutcome } from '../engine/encounter';
import {
  createRunState,
  evaluateEnding,
  type EncounterGradeMetrics,
  type EncounterRunProjection,
  type EndingFormula,
  type RewardRarity,
  type RunState,
} from '../engine/run';
import type { EndingKind } from '../ui/screens/ending';
import type { EncounterSession } from './createEncounterSession';
import type { EndingPresentationDefinition } from './gameFlowPresentation';

export const DEFAULT_RUN_SEED = 20_260_803;

function runtimeFlagDefaults(
  catalogue: FlagsDefinition,
): Readonly<Record<string, boolean | number | string>> {
  return Object.fromEntries(catalogue.flags.flatMap((definition) => {
    const value = definition.default_value;
    if (value === undefined) return [];
    if (
      typeof value !== 'boolean' &&
      typeof value !== 'string' &&
      !(typeof value === 'number' && Number.isFinite(value))
    ) {
      throw new Error(`Flag ${definition.flag_id} has a non-runtime default value.`);
    }
    return [[definition.flag_id, value] as const];
  }));
}

export function createInitialGameRunState(
  cards: CardsDefinition,
  balance: BalanceDefinition,
  flags: FlagsDefinition,
  runSeed = DEFAULT_RUN_SEED,
): RunState {
  const startingDeck = cards.cards.flatMap((card) =>
    Array.from({ length: card.starting_copies }, () => card.card_id),
  );
  return createRunState({
    runSeed,
    stress: balance.stress.max,
    dp: balance.dp.initial,
    trust: 0,
    flags: runtimeFlagDefaults(flags),
    deck: {
      drawPile: startingDeck,
      hand: [],
      discardPile: [],
      exhaustPile: [],
    },
  });
}

function completionRatio(
  objectives: readonly Readonly<{ completed: boolean }>[],
): number {
  if (objectives.length === 0) return 1;
  return objectives.filter((objective) => objective.completed).length / objectives.length;
}

export function encounterGradeMetrics(
  session: EncounterSession,
): EncounterGradeMetrics {
  const snapshot = session.coordinator.snapshot;
  const encounter = session.caseDefinition.encounters.find(
    (candidate) => candidate.encounter_id === session.encounterId,
  );
  if (encounter === undefined) {
    throw new Error(`Missing encounter definition ${session.encounterId}.`);
  }
  const conditions = encounter.objectives.state_conditions;
  const sweetSpot = session.coordinator.sweetSpot;
  const acquiredEvidence = Object.values(snapshot.evidence).filter(
    (evidence) => evidence.acquired,
  );
  return {
    requiredClaimResolutionRatio: completionRatio(snapshot.objectives.required),
    optionalObjectiveRatio: completionRatio(snapshot.objectives.optional),
    sweetSpotFinish:
      snapshot.resources.composure >= sweetSpot.composureMin &&
      snapshot.resources.composure <= sweetSpot.composureMax &&
      (conditions.coercion_max === undefined ||
        snapshot.resources.coercion <= conditions.coercion_max),
    originalsPreserved: acquiredEvidence.every(
      (evidence) => evidence.integrity !== 'DESTROYED',
    ),
    coercion: snapshot.resources.coercion,
  };
}

export function encounterRunProjection(
  session: EncounterSession,
  currentRun: RunState,
): EncounterRunProjection {
  const snapshot = session.coordinator.snapshot;
  return {
    stress: snapshot.resources.stress,
    dp: snapshot.resources.dp,
    trust: snapshot.resources.trust,
    deck: {
      drawPile: [...snapshot.deck.drawPile],
      hand: [...snapshot.deck.hand],
      discardPile: [...snapshot.deck.discardPile],
      exhaustPile: [...currentRun.deck.exhaustPile],
    },
    acquiredEvidenceIds: Object.entries(snapshot.evidence).flatMap(
      ([evidenceId, evidence]) => evidence.acquired ? [evidenceId] : [],
    ),
  };
}

export function rewardRarityForOutcome(
  outcome: EncounterOutcome,
  act: number,
  boss: boolean,
): RewardRarity {
  if (act >= 4) {
    return boss && outcome === 'BEST_RESOLUTION' ? 'LEGENDARY' : 'RARE';
  }
  if (act >= 1) {
    return boss && outcome === 'BEST_RESOLUTION' ? 'CASE' : 'UNCOMMON';
  }
  return 'COMMON';
}

const ENDING_FAILED_FLAG = 'APP-RUN-FAILED';
const ENDING_FALSE_CONFESSION_FLAG = 'APP-RUN-FALSE-CONFESSION';

export const GAME_ENDING_FORMULA: EndingFormula = {
  rules: [
    {
      endingId: 'ending-true',
      priority: 30,
      when: {
        type: 'ALL_OF',
        expressions: [
          { type: 'FLAG_EQUALS', flagId: 'F-13', value: true },
          {
            type: 'NOT',
            expression: {
              type: 'ANY_OF',
              expressions: [
                { type: 'FLAG_ENABLED', flagId: 'F-01' },
                { type: 'FLAG_ENABLED', flagId: ENDING_FAILED_FLAG },
                { type: 'FLAG_ENABLED', flagId: ENDING_FALSE_CONFESSION_FLAG },
              ],
            },
          },
        ],
      },
    },
    {
      endingId: 'ending-bad',
      priority: 20,
      when: {
        type: 'ANY_OF',
        expressions: [
          { type: 'FLAG_ENABLED', flagId: 'F-01' },
          { type: 'FLAG_ENABLED', flagId: ENDING_FAILED_FLAG },
          { type: 'FLAG_ENABLED', flagId: ENDING_FALSE_CONFESSION_FLAG },
        ],
      },
    },
  ],
  defaultEndingId: 'ending-normal',
};

export function endingIdForRun(state: RunState): string {
  return evaluateEnding(
    {
      ...state.flags,
      [ENDING_FAILED_FLAG]: state.outcomeHistory.at(-1)?.outcome === 'FAILED',
      [ENDING_FALSE_CONFESSION_FLAG]: state.falseConfessions > 0,
    },
    GAME_ENDING_FORMULA,
  );
}

export function endingKindForRun(state: RunState): EndingKind {
  switch (endingIdForRun(state)) {
    case 'ending-true': return 'TRUE';
    case 'ending-bad': return 'BAD';
    default: return 'NORMAL';
  }
}

export const ENDING_PRESENTATIONS: readonly EndingPresentationDefinition[] = [
  {
    endingId: 'ending-true',
    kind: 'TRUE',
    title: '완전한 조서',
    script: [
      '마지막 진술과 증거가 한 치의 빈틈 없이 맞물렸다.',
      '진실은 봉인된 기록이 되어 다음 수사를 비춘다.',
    ],
  },
  {
    endingId: 'ending-normal',
    kind: 'NORMAL',
    title: '마감된 조서',
    script: [
      '사건은 종결되었고 필요한 이름들은 기록에 남았다.',
      '다만 몇 장의 여백은 끝내 채워지지 않았다.',
    ],
  },
  {
    endingId: 'ending-bad',
    kind: 'BAD',
    title: '찢긴 조서',
    script: [
      '수사는 중단되었고 진술은 서로 다른 방향을 가리켰다.',
      '닫힌 서류철 안에서 진실은 다시 침묵한다.',
    ],
  },
];
