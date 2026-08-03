import type {
  NonCombatEventDefinition,
  RewardDefinition,
  RunStripDefinition,
} from '../engine/domain';
import { createNodeStrip, type CaseGrade, type RunState } from '../engine/run';
import type { EndingKind, EndingScreenModel } from '../ui/screens/ending';
import type { EventEffectView, EventSceneModel } from '../ui/screens/event';
import type { RewardScreenModel } from '../ui/screens/reward';
import {
  createRunStripModel,
  type RunStripScreenModel,
} from '../ui/screens/strip';

function effectLabels(value: unknown): readonly EventEffectView[] {
  if (Array.isArray(value)) {
    return value.map((effect: unknown) => {
      const record = effect !== null && typeof effect === 'object'
        ? effect as Record<string, unknown>
        : undefined;
      return {
        label: typeof record?.type === 'string' ? record.type : String(effect),
      };
    });
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).map(([key, amount]) => ({
      label: `${key} ${String(amount)}`,
    }));
  }
  return [];
}

export function toRunStripScreenModel(
  definition: RunStripDefinition,
  state: Pick<RunState, 'nodeIndex'>,
): RunStripScreenModel {
  const strip = createNodeStrip(definition);
  if (state.nodeIndex >= strip.length) {
    throw new Error('A completed run should render an ending instead of the node strip.');
  }
  return createRunStripModel(
    strip.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      label: node.ref,
    })),
    state.nodeIndex,
  );
}

export interface EventPresentationState {
  readonly discoveredSpotIds?: readonly string[];
  readonly attemptsUsed?: number;
}

export function toEventSceneModel(
  event: NonCombatEventDefinition,
  state: EventPresentationState = {},
): EventSceneModel {
  const base = {
    eventId: event.event_id,
    title: event.title_key,
    description: event.node,
  };
  if (event.pattern === 'A') {
    return {
      ...base,
      pattern: 'A',
      choices: event.choices.map((choice) => ({
        choiceId: choice.choice_id,
        label: choice.label_key,
        costs: effectLabels(choice.costs),
        gains: effectLabels(choice.gains),
      })),
    };
  }
  if (event.pattern === 'B') {
    return {
      ...base,
      pattern: 'B',
      items: event.items.map((item) => ({
        itemId: item.item_id,
        label: item.label_key,
      })),
      slots: event.slots.map((slot) => ({
        slotId: slot.slot_id,
        label: slot.label_key,
      })),
      answerMapping: { ...event.answer_mapping },
      successRatio: event.partial_scoring.success_ratio,
      partialRatio: event.partial_scoring.partial_ratio,
    };
  }
  const discovered = new Set(state.discoveredSpotIds ?? []);
  return {
    ...base,
    pattern: 'C',
    spots: event.spots.map((spot) => ({
      spotId: spot.spot_id,
      label: spot.label_key,
      discovered: discovered.has(spot.spot_id),
    })),
    attemptLimit: event.attempt_limit,
    attemptsUsed: state.attemptsUsed ?? 0,
  };
}

export function toRewardScreenModel(
  grade: CaseGrade,
  choices: readonly RewardDefinition[],
): RewardScreenModel {
  return {
    heading: '사건 정산',
    grade,
    choices: choices.map((reward) => ({
      rewardId: reward.reward_id,
      kind: reward.type,
      title: reward.reference_id ?? reward.resource ?? reward.reward_id,
      description:
        reward.type === 'RESOURCE'
          ? `${reward.resource ?? 'RESOURCE'} +${String(reward.amount ?? 0)}`
          : reward.reward_id,
      rarity: reward.rarity,
    })),
  };
}

export interface EndingPresentationDefinition {
  readonly endingId: string;
  readonly kind: EndingKind;
  readonly title: string;
  readonly script: readonly string[];
  readonly illustrationAssetKey?: string;
}

export function toEndingScreenModel(
  endingId: string,
  catalogue: readonly EndingPresentationDefinition[],
): EndingScreenModel {
  const ending = catalogue.find((candidate) => candidate.endingId === endingId);
  if (ending === undefined) throw new Error(`Missing ending presentation: ${endingId}.`);
  return { ...ending, script: [...ending.script] };
}
