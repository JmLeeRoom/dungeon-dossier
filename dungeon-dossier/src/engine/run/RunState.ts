import {
  RewardSchema,
  type FlagDefinition,
  type Cost,
  type EncounterDefinition,
  type Effect,
  type NonCombatEventDefinition,
  type RewardDefinition,
  type RewardsDefinition,
  type GradesDefinition,
} from '../domain';
import type { EncounterOutcome } from '../encounter';
import {
  applyFlagSetHooks,
  createFlagStore,
  withFlag,
  type AppliedFlagSet,
  type FlagConditionEvaluator,
  type FlagStore,
} from './FlagStore';
import {
  evaluateCaseGrade,
  type CaseGrade,
  type GradeEvaluationInput,
} from './GradeEvaluator';
import {
  advanceRunNodeIndex,
  currentRunNode,
  isRunStripComplete,
  type NodeDefinition,
} from './NodeStrip';
import {
  selectRewardChoices,
  type RewardConditionEvaluator,
  type RewardRarity,
} from './RewardSystem';

export interface RunDeckState {
  readonly drawPile: readonly string[];
  readonly hand: readonly string[];
  readonly discardPile: readonly string[];
  readonly exhaustPile: readonly string[];
}

export interface RunGradeRecord {
  readonly nodeId: string;
  readonly outcome: EncounterOutcome;
  readonly grade: CaseGrade;
}

export interface RunOutcomeRecord {
  readonly nodeId: string;
  readonly outcome: EncounterOutcome;
}

export interface RunState {
  readonly nodeIndex: number;
  readonly stress: number;
  readonly dp: number;
  readonly trust: number;
  readonly deck: RunDeckState;
  readonly acquiredRelicIds: readonly string[];
  readonly acquiredEnhancementIds: readonly string[];
  readonly acquiredEvidenceIds: readonly string[];
  readonly flags: FlagStore;
  readonly runSeed: number;
  readonly rewardSeedStream: number;
  readonly falseConfessions: number;
  readonly completedNodeIds: readonly string[];
  readonly pendingRewardIds: readonly string[];
  readonly claimedRewardIds: readonly string[];
  readonly gradeHistory: readonly RunGradeRecord[];
  readonly outcomeHistory: readonly RunOutcomeRecord[];
  readonly terminal: boolean;
}

export interface CreateRunStateInput {
  readonly runSeed: number;
  readonly stress: number;
  readonly dp: number;
  readonly trust: number;
  readonly deck: RunDeckState;
  readonly flags?: FlagStore;
  readonly acquiredRelicIds?: readonly string[];
  readonly acquiredEnhancementIds?: readonly string[];
  readonly acquiredEvidenceIds?: readonly string[];
}

export type EncounterGradeMetrics = Omit<GradeEvaluationInput, 'falseConfessions'>;
export type EncounterOutcomeRewards = NonNullable<
  EncounterDefinition['outcomes'][number]['rewards']
>;

export interface EncounterRunProjection {
  readonly stress: number;
  readonly dp: number;
  readonly trust: number;
  readonly deck: RunDeckState;
  readonly acquiredEvidenceIds?: readonly string[];
}

export interface CompleteEncounterNodeInput {
  readonly strip: readonly NodeDefinition[];
  readonly outcome: EncounterOutcome;
  readonly flagDefinitions: readonly FlagDefinition[];
  readonly rewardCatalogue: RewardsDefinition;
  readonly rewardRarity: RewardRarity;
  readonly episodeId: string;
  readonly act: number;
  readonly gradeCatalogue: GradesDefinition;
  readonly gradeMetrics: EncounterGradeMetrics;
  readonly encounterState?: EncounterRunProjection;
  readonly outcomeRewards?: EncounterOutcomeRewards;
  readonly evaluateFlagCondition?: FlagConditionEvaluator;
  readonly evaluateRewardCondition?: RewardConditionEvaluator;
}

export interface RunNodeCompletion {
  readonly state: RunState;
  readonly rewardChoices: readonly RewardDefinition[];
  readonly grade: CaseGrade;
  readonly appliedFlags: readonly AppliedFlagSet[];
}

export interface CompleteEventNodeInput {
  readonly strip: readonly NodeDefinition[];
  readonly flagDefinitions: readonly FlagDefinition[];
  readonly choiceId?: string;
  readonly eventDefinition?: NonCombatEventDefinition;
  readonly placement?: Readonly<Record<string, string>>;
  readonly investigatedSpotIds?: readonly string[];
  readonly evaluateFlagCondition?: FlagConditionEvaluator;
}

export interface PlacementEventResult {
  readonly correct: number;
  readonly total: number;
  readonly points: number;
  readonly maximumPoints: number;
  readonly ratio: number;
  readonly result: 'SUCCESS' | 'PARTIAL' | 'FAILED';
}

export interface RunEventCompletion {
  readonly state: RunState;
  readonly appliedFlags: readonly AppliedFlagSet[];
  readonly placementResult?: PlacementEventResult;
}

function assertUint32(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
  }
}

function assertResource(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
}

function copyDeck(deck: RunDeckState): RunDeckState {
  return {
    drawPile: [...deck.drawPile],
    hand: [...deck.hand],
    discardPile: [...deck.discardPile],
    exhaustPile: [...deck.exhaustPile],
  };
}

function applyOutcomeRewards(
  state: RunState,
  rewards: EncounterOutcomeRewards | undefined,
): RunState {
  if (rewards === undefined) return state;
  let flags = state.flags;
  for (const [flagId, value] of Object.entries(rewards.flags ?? {})) {
    if (
      typeof value !== 'boolean' &&
      typeof value !== 'string' &&
      !(typeof value === 'number' && Number.isFinite(value))
    ) {
      throw new Error(`Outcome reward flag ${flagId} must be a scalar runtime value.`);
    }
    flags = withFlag(flags, flagId, value);
  }
  return {
    ...state,
    dp: state.dp + (rewards.dp ?? 0),
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, ...(rewards.cards ?? [])],
    },
    acquiredRelicIds: [
      ...state.acquiredRelicIds,
      ...(rewards.relics ?? []),
    ].filter((relicId, index, relicIds) => relicIds.indexOf(relicId) === index),
    acquiredEvidenceIds: [
      ...state.acquiredEvidenceIds,
      ...(rewards.evidence ?? []),
    ].filter((evidenceId, index, evidenceIds) =>
      evidenceIds.indexOf(evidenceId) === index,
    ),
    flags,
  };
}

export function createRunState(input: CreateRunStateInput): RunState {
  assertUint32('runSeed', input.runSeed);
  assertResource('stress', input.stress);
  assertResource('dp', input.dp);
  assertResource('trust', input.trust);
  return {
    nodeIndex: 0,
    stress: input.stress,
    dp: input.dp,
    trust: input.trust,
    deck: copyDeck(input.deck),
    acquiredRelicIds: [...(input.acquiredRelicIds ?? [])],
    acquiredEnhancementIds: [...(input.acquiredEnhancementIds ?? [])],
    acquiredEvidenceIds: [...(input.acquiredEvidenceIds ?? [])],
    flags: createFlagStore(input.flags),
    runSeed: input.runSeed,
    // Dedicated deterministic reward stream; no other subsystem consumes it.
    rewardSeedStream: (input.runSeed ^ 0xa511e9b3) >>> 0,
    falseConfessions: 0,
    completedNodeIds: [],
    pendingRewardIds: [],
    claimedRewardIds: [],
    gradeHistory: [],
    outcomeHistory: [],
    terminal: false,
  };
}

function rewardEligible(outcome: EncounterOutcome): boolean {
  return outcome === 'BEST_RESOLUTION' || outcome === 'PARTIAL_RESOLUTION';
}

/** Encounter state is already terminal; this updates only run-owned state. */
export function completeEncounterNode(
  state: RunState,
  input: CompleteEncounterNodeInput,
): RunNodeCompletion {
  if (state.terminal) throw new Error('Cannot complete a node after the run is terminal.');
  if (state.pendingRewardIds.length > 0) {
    throw new Error('Select the pending reward before completing another node.');
  }
  const node = currentRunNode(input.strip, state.nodeIndex);
  if (node === null) throw new Error('Cannot complete a node after the run strip ends.');
  if (node.kind === 'EVENT') {
    throw new Error('completeEncounterNode accepts only ENCOUNTER or BOSS nodes.');
  }

  const projected = input.encounterState === undefined
    ? state
    : {
        ...state,
        stress: input.encounterState.stress,
        dp: input.encounterState.dp,
        trust: input.encounterState.trust,
        deck: copyDeck(input.encounterState.deck),
        acquiredEvidenceIds: [
          ...state.acquiredEvidenceIds,
          ...(input.encounterState.acquiredEvidenceIds ?? []),
        ].filter((evidenceId, index, evidenceIds) =>
          evidenceIds.indexOf(evidenceId) === index,
        ),
      };
  assertResource('encounterState.stress', projected.stress);
  assertResource('encounterState.dp', projected.dp);
  assertResource('encounterState.trust', projected.trust);
  const rewarded = applyOutcomeRewards(projected, input.outcomeRewards);

  const flagResult = applyFlagSetHooks(rewarded.flags, input.flagDefinitions, {
    encounter: node.ref,
    outcome: input.outcome,
    ...(input.evaluateFlagCondition === undefined
      ? {}
      : { evaluateCondition: input.evaluateFlagCondition }),
  });
  const falseConfessions = rewarded.falseConfessions +
    (input.outcome === 'COERCED_CONFESSION' ? 1 : 0);
  const grade = evaluateCaseGrade(input.gradeCatalogue, {
    ...input.gradeMetrics,
    falseConfessions,
  });

  const rewardResult = rewardEligible(input.outcome)
    ? selectRewardChoices({
        catalogue: input.rewardCatalogue,
        rarity: input.rewardRarity,
        episodeId: input.episodeId,
        act: input.act,
        boss: node.kind === 'BOSS',
        seedStream: rewarded.rewardSeedStream,
        ...(input.evaluateRewardCondition === undefined
          ? {}
          : { evaluateCondition: input.evaluateRewardCondition }),
      })
    : { choices: [], seedStream: rewarded.rewardSeedStream };

  const failed = input.outcome === 'FAILED';
  const nodeIndex = failed
    ? rewarded.nodeIndex
    : advanceRunNodeIndex(input.strip, rewarded.nodeIndex);
  const completedNodeIds = failed
    ? rewarded.completedNodeIds
    : [...rewarded.completedNodeIds, node.nodeId];
  const nextState: RunState = {
    ...rewarded,
    nodeIndex,
    flags: flagResult.store,
    rewardSeedStream: rewardResult.seedStream,
    falseConfessions,
    completedNodeIds,
    pendingRewardIds: rewardResult.choices.map((reward) => reward.reward_id),
    gradeHistory: [
      ...rewarded.gradeHistory,
      { nodeId: node.nodeId, outcome: input.outcome, grade: grade.grade },
    ],
    outcomeHistory: [
      ...rewarded.outcomeHistory,
      { nodeId: node.nodeId, outcome: input.outcome },
    ],
    terminal: failed || isRunStripComplete(input.strip, nodeIndex),
  };
  return {
    state: nextState,
    rewardChoices: rewardResult.choices,
    grade: grade.grade,
    appliedFlags: flagResult.applied,
  };
}

function applyRunCost(state: RunState, cost: Cost | undefined): RunState {
  if (cost === undefined) return state;
  const stress = state.stress - (cost.stress ?? 0);
  const dp = state.dp - (cost.dp ?? 0);
  const trust = state.trust - (cost.trust ?? 0);
  if (stress < 0 || dp < 0 || trust < 0) {
    throw new Error('Event cost exceeds the available run resource.');
  }
  return { ...state, stress, dp, trust };
}

function applyRunEffects(state: RunState, effects: readonly Effect[]): RunState {
  let next = state;
  for (const effect of effects) {
    if (effect.type === 'GRANT_EVIDENCE' && effect.target !== undefined) {
      next = {
        ...next,
        acquiredEvidenceIds: appendUnique(next.acquiredEvidenceIds, effect.target),
      };
      continue;
    }
    if (effect.type !== 'ADJUST_RESOURCE' || effect.delta === undefined) continue;
    if (effect.resource === 'stress') {
      next = { ...next, stress: Math.max(0, next.stress + effect.delta) };
    } else if (effect.resource === 'dp') {
      next = { ...next, dp: Math.max(0, next.dp + effect.delta) };
    } else if (effect.resource === 'trust') {
      next = { ...next, trust: Math.max(0, next.trust + effect.delta) };
    }
  }
  return next;
}

export function evaluatePlacementEvent(
  event: Extract<NonCombatEventDefinition, { pattern: 'B' }>,
  placement: Readonly<Record<string, string>>,
): PlacementEventResult {
  const itemIds = event.items.map((item) => item.item_id);
  const itemIdSet = new Set(itemIds);
  const slotIds = new Set(event.slots.map((slot) => slot.slot_id));
  const submittedIds = Object.keys(placement);
  if (
    submittedIds.length !== itemIds.length ||
    submittedIds.some((itemId) => !itemIdSet.has(itemId))
  ) {
    throw new Error('Pattern B completion requires exactly one placement per item.');
  }
  const submittedSlots = itemIds.map((itemId) => placement[itemId]);
  if (
    submittedSlots.some((slotId) => slotId === undefined || !slotIds.has(slotId)) ||
    new Set(submittedSlots).size !== submittedSlots.length
  ) {
    throw new Error('Pattern B completion requires unique valid slots.');
  }
  const correct = itemIds.filter(
    (itemId) => placement[itemId] === event.answer_mapping[itemId],
  ).length;
  const total = itemIds.length;
  const points = correct * event.partial_scoring.points_per_correct;
  const maximumPoints = total * event.partial_scoring.points_per_correct;
  const ratio = maximumPoints === 0 ? 0 : points / maximumPoints;
  return {
    correct,
    total,
    points,
    maximumPoints,
    ratio,
    result:
      ratio >= event.partial_scoring.success_ratio
        ? 'SUCCESS'
        : ratio >= event.partial_scoring.partial_ratio
          ? 'PARTIAL'
          : 'FAILED',
  };
}

interface AppliedEventDefinition {
  readonly state: RunState;
  readonly placementResult?: PlacementEventResult;
}

function applyEventDefinition(
  state: RunState,
  node: NodeDefinition,
  input: CompleteEventNodeInput,
): AppliedEventDefinition {
  const event = input.eventDefinition;
  if (event === undefined) return { state };
  if (event.event_id !== node.ref) {
    throw new Error(`Event ${event.event_id} does not match run node ${node.ref}.`);
  }
  if (event.pattern === 'A') {
    const choice = event.choices.find((candidate) => candidate.choice_id === input.choiceId);
    if (choice === undefined) throw new Error('Pattern A completion requires a valid choice.');
    let next = applyRunEffects(applyRunCost(state, choice.costs), choice.gains);
    for (const [flagId, value] of Object.entries(choice.sets_flags)) {
      if (
        typeof value === 'boolean' ||
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        next = { ...next, flags: withFlag(next.flags, flagId, value) };
      }
    }
    return { state: next };
  }
  if (event.pattern === 'B') {
    if (input.placement === undefined) {
      throw new Error('Pattern B completion requires a placement submission.');
    }
    return {
      state,
      placementResult: evaluatePlacementEvent(event, input.placement),
    };
  }
  if (event.pattern === 'C') {
    const spotIds = input.investigatedSpotIds ?? [];
    if (spotIds.length > event.attempt_limit || new Set(spotIds).size !== spotIds.length) {
      throw new Error('Pattern C investigation exceeds its unique attempt limit.');
    }
    let next = state;
    for (const spotId of spotIds) {
      const spot = event.spots.find((candidate) => candidate.spot_id === spotId);
      if (spot === undefined) throw new Error(`Unknown investigation spot ${spotId}.`);
      next = applyRunEffects(applyRunCost(next, event.per_attempt_costs), spot.effects);
    }
    return { state: next };
  }
  return { state };
}

/** Advances an EVENT node, applying run resources, discoveries, and flag hooks. */
export function completeEventNode(
  state: RunState,
  input: CompleteEventNodeInput,
): RunEventCompletion {
  if (state.terminal) throw new Error('Cannot complete an event after the run is terminal.');
  if (state.pendingRewardIds.length > 0) {
    throw new Error('Select the pending reward before completing an event.');
  }
  const node = currentRunNode(input.strip, state.nodeIndex);
  if (node === null) throw new Error('Cannot complete an event after the run strip ends.');
  if (node.kind !== 'EVENT') throw new Error('completeEventNode accepts only EVENT nodes.');

  const appliedEvent = applyEventDefinition(state, node, input);
  const flagResult = applyFlagSetHooks(appliedEvent.state.flags, input.flagDefinitions, {
    event: node.ref,
    ...(input.choiceId === undefined ? {} : { choice: input.choiceId }),
    ...(input.evaluateFlagCondition === undefined
      ? {}
      : { evaluateCondition: input.evaluateFlagCondition }),
  });
  const nodeIndex = advanceRunNodeIndex(input.strip, state.nodeIndex);
  return {
    state: {
      ...appliedEvent.state,
      nodeIndex,
      flags: flagResult.store,
      completedNodeIds: [...appliedEvent.state.completedNodeIds, node.nodeId],
      terminal: isRunStripComplete(input.strip, nodeIndex),
    },
    appliedFlags: flagResult.applied,
    ...(appliedEvent.placementResult === undefined
      ? {}
      : { placementResult: appliedEvent.placementResult }),
  };
}

function appendUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}

/** Applies one of the pending catalogue rewards and clears the choice set. */
export function claimRunReward(
  state: RunState,
  rewardInput: RewardDefinition,
): RunState {
  const reward = RewardSchema.parse(rewardInput);
  if (!state.pendingRewardIds.includes(reward.reward_id)) {
    throw new Error(`Reward ${reward.reward_id} is not one of the pending choices.`);
  }

  let stress = state.stress;
  let dp = state.dp;
  let trust = state.trust;
  let deck = state.deck;
  let acquiredRelicIds = state.acquiredRelicIds;
  let acquiredEnhancementIds = state.acquiredEnhancementIds;

  if (reward.type === 'RESOURCE') {
    if (reward.amount === undefined) {
      throw new Error(`Resource reward ${reward.reward_id} requires amount.`);
    }
    switch (reward.resource) {
      case 'DP':
        dp += reward.amount;
        break;
      case 'STRESS':
        stress += reward.amount;
        break;
      case 'TRUST':
        trust += reward.amount;
        break;
      default:
        throw new Error(`Resource reward ${reward.reward_id} requires resource.`);
    }
  } else {
    const referenceId = reward.reference_id;
    if (referenceId === undefined) {
      throw new Error(`Reward ${reward.reward_id} requires reference_id.`);
    }
    switch (reward.type) {
      case 'CARD':
        deck = { ...state.deck, discardPile: [...state.deck.discardPile, referenceId] };
        break;
      case 'ENHANCEMENT':
        acquiredEnhancementIds = appendUnique(acquiredEnhancementIds, referenceId);
        break;
      case 'RELIC':
        acquiredRelicIds = appendUnique(acquiredRelicIds, referenceId);
        break;
    }
  }

  return {
    ...state,
    stress,
    dp,
    trust,
    deck,
    acquiredRelicIds,
    acquiredEnhancementIds,
    pendingRewardIds: [],
    claimedRewardIds: [...state.claimedRewardIds, reward.reward_id],
  };
}
