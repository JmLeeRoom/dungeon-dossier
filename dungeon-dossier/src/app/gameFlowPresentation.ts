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
import { t } from './i18n';

const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  dp: 'DP',
  stress: '스트레스',
  trust: '신뢰도',
  cp: 'CP',
  composure: '평정',
  coercion: '강압',
};

function resourceLabel(resource: string): string {
  return t(`resource.${resource.toLowerCase()}`, RESOURCE_LABELS[resource.toLowerCase()] ?? resource);
}

function effectRecordLabel(record: Record<string, unknown>): string {
  const type = typeof record.type === 'string' ? record.type : undefined;
  if (type === 'GRANT_EVIDENCE') {
    const target = typeof record.target === 'string' ? record.target : '';
    return `${t('effect.grant_evidence', '증거 확보')} · ${t(`evidence.${target}.title`, target)}`;
  }
  if (type === 'ADJUST_RESOURCE') {
    const resource = typeof record.resource === 'string' ? record.resource : '';
    const delta = typeof record.delta === 'number' ? record.delta : 0;
    return `${resourceLabel(resource)} ${delta >= 0 ? '+' : ''}${String(delta)}`;
  }
  if (type === 'DRAW_CARD') return t('effect.draw_card', '카드 뽑기');
  if (type === 'OPEN_ROUTE') return t('effect.open_route', '질문 경로 개방');
  if (type === 'REVEAL_CLAIMS') return t('effect.reveal_claims', '진술 공개');
  if (type === 'UPGRADE_EVIDENCE') return t('effect.upgrade_evidence', '증거 등급 상승');
  return type === undefined ? '' : t(`effect.${type.toLowerCase()}`, type);
}

export function effectLabels(value: unknown): readonly EventEffectView[] {
  if (Array.isArray(value)) {
    return value.flatMap((effect: unknown) => {
      const record = effect !== null && typeof effect === 'object'
        ? effect as Record<string, unknown>
        : undefined;
      const label = record === undefined ? String(effect) : effectRecordLabel(record);
      return label === '' ? [] : [{ label }];
    });
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, amount]) => {
      if (typeof amount !== 'number' || amount === 0) return [];
      return [{ label: `${resourceLabel(key)} -${String(amount)}` }];
    });
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
      label: t(`node.${node.ref}`, node.ref),
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
    title: t(event.title_key),
    description: t(
      event.description_key ?? `event.${event.event_id}.description`,
      '',
    ),
  };
  if (event.pattern === 'A') {
    return {
      ...base,
      pattern: 'A',
      choices: event.choices.map((choice) => ({
        choiceId: choice.choice_id,
        label: t(choice.label_key),
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
        label: t(item.label_key),
      })),
      slots: event.slots.map((slot) => ({
        slotId: slot.slot_id,
        label: t(slot.label_key),
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
      label: t(spot.label_key),
      discovered: discovered.has(spot.spot_id),
    })),
    attemptLimit: event.attempt_limit,
    attemptsUsed: state.attemptsUsed ?? 0,
  };
}

function rewardFallbackTitle(reward: RewardDefinition): string {
  if (reward.type === 'RESOURCE') {
    return `${resourceLabel(reward.resource ?? 'RESOURCE')} +${String(reward.amount ?? 0)}`;
  }
  const referenceId = reward.reference_id ?? reward.reward_id;
  if (reward.type === 'CARD') return t(`card.${referenceId}.name`, referenceId);
  if (reward.type === 'RELIC') return t(`relic.${referenceId}.name`, referenceId);
  return t(`enhancement.${referenceId}.name`, referenceId);
}

export function toRewardScreenModel(
  grade: CaseGrade,
  choices: readonly RewardDefinition[],
): RewardScreenModel {
  return {
    heading: t('reward.heading', '사건 정산'),
    grade,
    choices: choices.map((reward) => ({
      rewardId: reward.reward_id,
      kind: reward.type,
      title: t(`reward.${reward.reward_id}.title`, rewardFallbackTitle(reward)),
      description: t(
        `reward.${reward.reward_id}.desc`,
        reward.type === 'RESOURCE'
          ? `${resourceLabel(reward.resource ?? 'RESOURCE')} +${String(reward.amount ?? 0)}`
          : rewardFallbackTitle(reward),
      ),
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
