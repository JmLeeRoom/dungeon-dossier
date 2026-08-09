import type {
  NonCombatEventDefinition,
  RewardDefinition,
  RunStripDefinition,
} from '../engine/domain';
import {
  createNodeStrip,
  episodeNodes,
  runEpisodes,
  type CaseGrade,
  type NodeDefinition,
  type RunState,
} from '../engine/run';
import type { EndingKind, EndingScreenModel } from '../ui/screens/ending';
import type { EventEffectView, EventSceneModel } from '../ui/screens/event';
import type { RewardScreenModel } from '../ui/screens/reward';
import {
  createRunStripModel,
  type RunStripScreenModel,
} from '../ui/screens/strip';
import { t } from './i18n';
import { boardNodePhotoAssetKey, eventArtBinding } from './uiAssetBindings';

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

export interface RunStripPresentationOptions {
  /** Route the run actually resolved. Omitted rebuilds the canonical route. */
  readonly strip?: readonly NodeDefinition[];
  /** Show all three stages of the active episode instead of revealing in turn. */
  readonly revealWholeEpisode?: boolean;
}

/**
 * Projects only the active episode. Nodes of later episodes never enter the
 * model at all, so no label, kind or ref of unseen content can reach the
 * renderer, the autoplay string sweep or an accessibility reader.
 */
export function toRunStripScreenModel(
  definition: RunStripDefinition,
  state: Pick<RunState, 'nodeIndex'>,
  options: RunStripPresentationOptions = {},
): RunStripScreenModel {
  const strip = options.strip ?? createNodeStrip(definition);
  if (state.nodeIndex >= strip.length) {
    throw new Error('A completed run should render an ending instead of the node strip.');
  }
  const episodes = runEpisodes(strip);
  const activeNode = strip[state.nodeIndex];
  if (activeNode === undefined) {
    throw new Error('The run cursor does not point at a resolved node.');
  }
  const activeEpisodeIndex = episodes.findIndex(
    (episode) => episode.episodeId === activeNode.episodeId,
  );
  const nodes = episodeNodes(strip, activeNode.episodeId).map((node) => {
    // Attached to the board input, which `createRunStripModel` keeps on KNOWN
    // slots and drops from VEILED ones along with the id and the label.
    const artAssetKey = boardNodePhotoAssetKey(node.ref);
    return {
      nodeId: node.nodeId,
      kind: node.kind,
      role: node.slotRole,
      label: t(`node.${node.ref}`, node.ref),
      ...(artAssetKey === undefined ? {} : { artAssetKey }),
    };
  });
  const clearedEpisodes = episodes.slice(0, Math.max(0, activeEpisodeIndex)).map(
    (episode, index) => ({
      episodeId: episode.episodeId,
      displayIndex: index + 1,
      label: t(`episode.${episode.episodeId}`, episode.episodeId),
    }),
  );

  return createRunStripModel({
    episodeId: activeNode.episodeId,
    episodeLabel: t(`episode.${activeNode.episodeId}`, activeNode.episodeId),
    episodeDisplayIndex: activeEpisodeIndex + 1,
    episodeCount: episodes.length,
    nodes,
    activeSlotIndex: activeNode.slotIndex,
    clearedEpisodes,
    hasNextEpisode: activeEpisodeIndex < episodes.length - 1,
    ...(options.revealWholeEpisode === undefined
      ? {}
      : { revealWholeEpisode: options.revealWholeEpisode }),
  });
}

export interface EventOwnedCardView {
  readonly cardId: string;
  readonly intent: string;
  /** The card's authored name key. Rebuilding one from the id would miss. */
  readonly nameKey: string;
}

export interface EventPresentationState {
  readonly discoveredSpotIds?: readonly string[];
  readonly attemptsUsed?: number;
  /** Live run resources; absent means every choice renders as affordable. */
  readonly resources?: Pick<RunState, 'dp' | 'stress' | 'trust'>;
  /** Pattern D: the deck the player may spend a tuning on. */
  readonly ownedCards?: readonly EventOwnedCardView[];
  readonly cardTuning?: RunState['cardTuning'];
  readonly selectedOptionId?: string;
  readonly selectedCardId?: string;
  /** Pattern E: topics already canvassed, run-wide. */
  readonly canvassedTopicIds?: readonly string[];
  /** Pattern F: targets swept during this visit, plus the pouch contents. */
  readonly collectedTargetIds?: readonly string[];
  readonly acquiredEvidenceIds?: readonly string[];
}

const TUNING_LABELS: Readonly<Record<string, string>> = {
  cp_delta: 'CP',
  composure_damage_delta: '평정 타격',
  coercion_delta: '강압',
};

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${String(value)}`;
}

function tuningLabels(
  tuning: Readonly<Record<string, number | undefined>>,
): readonly EventEffectView[] {
  return Object.entries(tuning).flatMap(([key, value]) => {
    if (typeof value !== 'number' || value === 0) return [];
    const label = t(`tuning.${key}`, TUNING_LABELS[key] ?? key);
    return [{ label: `${label} ${signed(value)}` }];
  });
}

function cardTuningLabels(
  tuning: RunState['cardTuning'][string] | undefined,
): readonly EventEffectView[] {
  if (tuning === undefined) return [];
  return tuningLabels({
    cp_delta: tuning.cpDelta,
    composure_damage_delta: tuning.composureDamageDelta,
    coercion_delta: tuning.coercionDelta,
  });
}

type EventCost = NonNullable<
  Extract<NonCombatEventDefinition, { pattern: 'A' }>['choices'][number]['costs']
>;

/**
 * Mirrors the run-layer cost check so a choice the engine would reject is greyed
 * out instead of failing silently when it is clicked.
 */
function costShortfall(
  cost: EventCost | undefined,
  resources: EventPresentationState['resources'],
): string | undefined {
  if (cost === undefined || resources === undefined) return undefined;
  const available: Readonly<Record<string, number>> = {
    dp: resources.dp,
    stress: resources.stress,
    trust: resources.trust,
  };
  for (const [key, amount] of Object.entries(cost)) {
    if (typeof amount !== 'number' || amount <= 0) continue;
    const held = available[key];
    if (held === undefined) continue;
    if (held < amount) {
      return `${resourceLabel(key)} 부족 (${String(held)}/${String(amount)})`;
    }
  }
  return undefined;
}

export function toEventSceneModel(
  event: NonCombatEventDefinition,
  state: EventPresentationState = {},
): EventSceneModel {
  const art = eventArtBinding(event.event_id);
  const base = {
    eventId: event.event_id,
    title: t(event.title_key),
    description: t(
      event.description_key ?? `event.${event.event_id}.description`,
      '',
    ),
    ...(art === undefined ? {} : art),
  };
  if (event.pattern === 'A') {
    return {
      ...base,
      pattern: 'A',
      choices: event.choices.map((choice) => {
        const blockedReason = costShortfall(choice.costs, state.resources);
        return {
          choiceId: choice.choice_id,
          label: t(choice.label_key),
          costs: effectLabels(choice.costs),
          gains: effectLabels(choice.gains),
          affordable: blockedReason === undefined,
          ...(blockedReason === undefined ? {} : { blockedReason }),
        };
      }),
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
  if (event.pattern === 'D') {
    const owned = state.ownedCards ?? [];
    const tuning = state.cardTuning ?? {};
    return {
      ...base,
      pattern: 'D',
      options: event.options.map((option) => {
        const blockedReason = costShortfall(option.costs, state.resources);
        const intents = new Set<string>(option.eligible_intents);
        return {
          optionId: option.option_id,
          label: t(option.label_key),
          costs: effectLabels(option.costs),
          tuning: tuningLabels(option.tuning),
          affordable: blockedReason === undefined,
          ...(blockedReason === undefined ? {} : { blockedReason }),
          eligibleCardIds: owned
            .filter((card) => intents.size === 0 || intents.has(card.intent))
            .map((card) => card.cardId),
        };
      }),
      cards: owned.map((card) => ({
        cardId: card.cardId,
        label: t(card.nameKey, card.cardId),
        existingTuning: cardTuningLabels(tuning[card.cardId]),
      })),
      ...(state.selectedOptionId === undefined
        ? {}
        : { selectedOptionId: state.selectedOptionId }),
      ...(state.selectedCardId === undefined
        ? {}
        : { selectedCardId: state.selectedCardId }),
      ...(owned.length === 0
        ? {
            fallbackNotice: t(
              'event.enhance.no_eligible_card',
              '강화할 수 있는 카드가 없습니다. 대신 대체 보상을 받습니다.',
            ),
          }
        : {}),
    };
  }
  if (event.pattern === 'E') {
    const canvassed = new Set(state.canvassedTopicIds ?? []);
    const blocked = costShortfall(event.per_attempt_costs, state.resources);
    return {
      ...base,
      pattern: 'E',
      topics: event.topics.map((topic) => {
        const done = canvassed.has(topic.topic_id);
        return {
          topicId: topic.topic_id,
          label: t(topic.label_key),
          // The payoff line is the reward; showing it up front would give it away.
          ...(done ? { reveal: t(topic.reveal_key) } : {}),
          canvassed: done,
          affordable: blocked === undefined,
        };
      }),
      attemptLimit: event.attempt_limit,
      attemptsUsed: canvassed.size,
      attemptCosts: effectLabels(event.per_attempt_costs),
    };
  }
  if (event.pattern === 'F') {
    const collected = new Set(state.collectedTargetIds ?? []);
    const held = new Set(state.acquiredEvidenceIds ?? []);
    const blocked = costShortfall(event.per_attempt_costs, state.resources);
    return {
      ...base,
      pattern: 'F',
      targets: event.targets.map((target) => ({
        targetId: target.target_id,
        label: t(target.label_key),
        grade: target.grade,
        collected: collected.has(target.target_id),
        alreadyHeld: held.has(target.evidence_id),
        affordable: blocked === undefined,
      })),
      attemptLimit: event.attempt_limit,
      attemptsUsed: collected.size,
      attemptCosts: effectLabels(event.per_attempt_costs),
    };
  }
  const discovered = new Set(state.discoveredSpotIds ?? []);
  const attemptBlocked = costShortfall(event.per_attempt_costs, state.resources);
  return {
    ...base,
    pattern: 'C',
    spots: event.spots.map((spot) => {
      const found = discovered.has(spot.spot_id);
      return {
        spotId: spot.spot_id,
        label: t(spot.label_key),
        discovered: found,
        // Findings stay sealed until the spot is probed, so the list is not a
        // free preview of the whole scene.
        findings: found ? effectLabels(spot.effects) : [],
        affordable: attemptBlocked === undefined,
      };
    }),
    attemptLimit: event.attempt_limit,
    attemptsUsed: state.attemptsUsed ?? 0,
    attemptCosts: effectLabels(event.per_attempt_costs),
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
