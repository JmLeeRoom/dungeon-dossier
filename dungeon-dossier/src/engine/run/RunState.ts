import {
  MAX_ABS_CARD_TUNING,
  RewardSchema,
  type ActionIntent,
  type FlagDefinition,
  type Cost,
  type EncounterDefinition,
  type Effect,
  type Grade,
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
  type FlagValue,
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
  runEpisodeIds,
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

/** Signed additive tuning; consumers clamp at spend time, never at accumulation. */
/**
 * Run-scope ceilings taken from balance.json. Absent means unbounded, which is
 * what every pre-existing caller got before bounds were threaded through.
 */
export interface RunResourceBounds {
  readonly stressMax?: number;
  readonly trustMax?: number;
  readonly dpMax?: number;
}

export function runResourceBoundsFromBalance(
  balance: Readonly<Record<string, unknown>>,
): RunResourceBounds {
  const readMax = (key: string): number | undefined => {
    const section = balance[key];
    if (section === null || typeof section !== 'object') return undefined;
    const max = (section as Readonly<Record<string, unknown>>)['max'];
    return typeof max === 'number' && Number.isFinite(max) ? max : undefined;
  };
  const stressMax = readMax('stress');
  const trustMax = readMax('trust');
  const dpMax = readMax('dp');
  return {
    ...(stressMax === undefined ? {} : { stressMax }),
    ...(trustMax === undefined ? {} : { trustMax }),
    ...(dpMax === undefined ? {} : { dpMax }),
  };
}

/** The single place a run resource is bounded, so no path can skip a ceiling. */
export function clampRunResource(value: number, max: number | undefined): number {
  const floored = Math.max(0, value);
  return max === undefined ? floored : Math.min(floored, max);
}

export interface CardTuning {
  readonly cpDelta: number;
  readonly composureDamageDelta: number;
  readonly coercionDelta: number;
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
  /** Permanent per-card-definition tuning acquired from pattern D events. */
  readonly cardTuning: Readonly<Record<string, CardTuning>>;
  /** Topics already canvassed this run; pattern E must not re-offer them. */
  readonly canvassedTopicIds: readonly string[];
  /** Grade overrides; acquiredEvidenceIds alone cannot express F or UPGRADE_EVIDENCE. */
  readonly evidenceGradeById: Readonly<Record<string, Grade>>;
  /** Routes earned by events and injected into the next compatible encounter. */
  readonly openRouteIds: readonly string[];
  /** Dead-scene retries taken this run. The retry policy itself lives in the app layer. */
  readonly retryCount: number;
  /** Episode the cursor currently sits in. Empty only before a strip is known. */
  readonly activeEpisodeId: string;
  /** Episodes the player may enter; the next one is added on a boss clear. */
  readonly unlockedEpisodeIds: readonly string[];
  /** Episodes whose BOSS stage has been cleared, in clear order. */
  readonly completedEpisodeIds: readonly string[];
  readonly terminal: boolean;
  /** Ceilings every resource mutation honours; empty means unbounded. */
  readonly resourceBounds: RunResourceBounds;
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
  readonly resourceBounds?: RunResourceBounds;
  /**
   * Episode order of the resolved route. Only the first entry is needed to arm
   * the run; the rest are re-derived from the strip at every node boundary.
   */
  readonly episodeIds?: readonly string[];
}

/**
 * Structural transitions a completed node produced. The UI drives fog reveals
 * and camera moves from these instead of diffing state between renders.
 */
export type RunProgressionEvent =
  | { readonly type: 'NODE_CLEARED'; readonly nodeId: string; readonly episodeId: string }
  | { readonly type: 'EPISODE_CLEARED'; readonly episodeId: string }
  | { readonly type: 'EPISODE_UNLOCKED'; readonly episodeId: string }
  | { readonly type: 'RUN_CLEARED' };

interface EpisodeProgress {
  readonly activeEpisodeId: string;
  readonly unlockedEpisodeIds: readonly string[];
  readonly completedEpisodeIds: readonly string[];
  readonly progression: readonly RunProgressionEvent[];
}

/**
 * Recomputes episode bookkeeping after a node advanced the cursor. Clearing the
 * BOSS stage is the only thing that completes an episode and unlocks the next,
 * so the fog can never open early even if the cursor is restored from a save.
 */
function advanceEpisodeProgress(
  state: RunState,
  strip: readonly NodeDefinition[],
  completedNode: NodeDefinition,
  nextNodeIndex: number,
): EpisodeProgress {
  const progression: RunProgressionEvent[] = [
    { type: 'NODE_CLEARED', nodeId: completedNode.nodeId, episodeId: completedNode.episodeId },
  ];
  const nextNode = strip[nextNodeIndex];
  const crossedEpisode = nextNode === undefined || nextNode.episodeId !== completedNode.episodeId;
  if (!crossedEpisode) {
    return {
      activeEpisodeId: completedNode.episodeId,
      unlockedEpisodeIds: state.unlockedEpisodeIds,
      completedEpisodeIds: state.completedEpisodeIds,
      progression,
    };
  }

  progression.push({ type: 'EPISODE_CLEARED', episodeId: completedNode.episodeId });
  const completedEpisodeIds = appendUnique(
    state.completedEpisodeIds,
    completedNode.episodeId,
  );
  if (nextNode === undefined) {
    progression.push({ type: 'RUN_CLEARED' });
    return {
      activeEpisodeId: completedNode.episodeId,
      unlockedEpisodeIds: state.unlockedEpisodeIds,
      completedEpisodeIds,
      progression,
    };
  }

  progression.push({ type: 'EPISODE_UNLOCKED', episodeId: nextNode.episodeId });
  return {
    activeEpisodeId: nextNode.episodeId,
    unlockedEpisodeIds: appendUnique(state.unlockedEpisodeIds, nextNode.episodeId),
    completedEpisodeIds,
    progression,
  };
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

/** Retries are capped so a defeat still costs something across a whole run. */
export const DEFAULT_RETRY_LIMIT = 2;
/** Stress floor a retry restores to, so the next attempt is actually winnable. */
export const DEFAULT_RETRY_STRESS_RESTORE = 60;

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
  /**
   * TERMINATE (the default) ends the run on a failed encounter. RETRY keeps the
   * run alive at the same node while attempts remain.
   */
  readonly failurePolicy?: 'RETRY' | 'TERMINATE';
  readonly retryLimit?: number;
  readonly retryStressRestore?: number;
}

export interface RunNodeCompletion {
  readonly state: RunState;
  readonly rewardChoices: readonly RewardDefinition[];
  readonly grade: CaseGrade;
  readonly appliedFlags: readonly AppliedFlagSet[];
  /** True when a failure was absorbed and the node may be attempted again. */
  readonly retryAllowed: boolean;
  /** Structural transitions this completion produced; empty on an absorbed failure. */
  readonly progression: readonly RunProgressionEvent[];
}

/** Branch consequences a framing cutscene staged before the node committed. */
export interface StagedCutsceneOutcome {
  readonly flags: Readonly<Record<string, boolean | number | string>>;
  readonly gains: readonly Effect[];
}

export interface CompleteEventNodeInput {
  readonly strip: readonly NodeDefinition[];
  readonly cutsceneOutcome?: StagedCutsceneOutcome;
  readonly flagDefinitions: readonly FlagDefinition[];
  readonly choiceId?: string;
  readonly eventDefinition?: NonCombatEventDefinition;
  readonly placement?: Readonly<Record<string, string>>;
  readonly investigatedSpotIds?: readonly string[];
  /** Pattern D: the chosen tuning option. Absent means the player declined. */
  readonly optionId?: string;
  /** Pattern D: the owned card definition the option tunes. */
  readonly tunedCardId?: string;
  /**
   * Pattern D intent lookup for the owned catalogue. The engine never reads card
   * content, so the app supplies each owned definition's intent for eligibility.
   */
  readonly cardIntentsById?: Readonly<Record<string, ActionIntent>>;
  /** Pattern E: topics canvassed in authored selection order. */
  readonly canvassedTopicIds?: readonly string[];
  readonly resourceBounds?: RunResourceBounds;
  /** Pattern F: collection targets swept in authored selection order. */
  readonly collectedTargetIds?: readonly string[];
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
  /** Structural transitions this completion produced. */
  readonly progression: readonly RunProgressionEvent[];
  /**
   * Present when the event itself ended the run. The caller routes to the
   * defeat screen instead of the next node.
   */
  readonly failureReason?: 'STRESS_DEPLETED';
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
  const resourceBounds = input.resourceBounds ?? {};
  return {
    nodeIndex: 0,
    stress: clampRunResource(input.stress, resourceBounds.stressMax),
    dp: clampRunResource(input.dp, resourceBounds.dpMax),
    trust: clampRunResource(input.trust, resourceBounds.trustMax),
    resourceBounds,
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
    cardTuning: {},
    canvassedTopicIds: [],
    evidenceGradeById: {},
    openRouteIds: [],
    retryCount: 0,
    // A fresh run may only ever stand in the first episode, and only that one
    // is unlocked; every later episode stays fogged until its boss falls.
    activeEpisodeId: input.episodeIds?.[0] ?? '',
    unlockedEpisodeIds: input.episodeIds?.[0] === undefined ? [] : [input.episodeIds[0]],
    completedEpisodeIds: [],
    terminal: false,
  };
}

/** Episode bookkeeping a restored save should carry when it predates the field. */
export function deriveEpisodeProgress(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
  completedNodeIds: readonly string[],
): Readonly<{
  activeEpisodeId: string;
  unlockedEpisodeIds: readonly string[];
  completedEpisodeIds: readonly string[];
}> {
  const episodeIds = runEpisodeIds(strip);
  if (episodeIds.length === 0) {
    return { activeEpisodeId: '', unlockedEpisodeIds: [], completedEpisodeIds: [] };
  }
  const completed = new Set(completedNodeIds);
  const completedEpisodeIds = episodeIds.filter((episodeId) =>
    strip
      .filter((node) => node.episodeId === episodeId)
      .every((node) => completed.has(node.nodeId)),
  );
  const activeNode = strip[Math.min(nodeIndex, strip.length - 1)];
  const activeEpisodeId = activeNode?.episodeId ?? episodeIds[0] ?? '';
  const unlockedEpisodeIds = episodeIds.slice(
    0,
    Math.max(1, episodeIds.indexOf(activeEpisodeId) + 1),
  );
  return { activeEpisodeId, unlockedEpisodeIds, completedEpisodeIds };
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
        excludeRewardIds: rewarded.claimedRewardIds,
        ownedReferenceIds: [
          ...rewarded.acquiredRelicIds,
          ...rewarded.acquiredEnhancementIds,
        ],
        ...(input.evaluateRewardCondition === undefined
          ? {}
          : { evaluateCondition: input.evaluateRewardCondition }),
      })
    : { choices: [], seedStream: rewarded.rewardSeedStream };

  const failed = input.outcome === 'FAILED';
  // A failure may now leave the run alive so the node can be attempted again.
  // RETRY is only honoured while the run still has attempts left; otherwise the
  // failure terminates the run exactly as it always did.
  const retryAllowed =
    failed &&
    input.failurePolicy === 'RETRY' &&
    rewarded.retryCount < (input.retryLimit ?? DEFAULT_RETRY_LIMIT);
  const nodeIndex = failed
    ? rewarded.nodeIndex
    : advanceRunNodeIndex(input.strip, rewarded.nodeIndex);
  const completedNodeIds = failed
    ? rewarded.completedNodeIds
    : [...rewarded.completedNodeIds, node.nodeId];
  // A failed node never clears its episode, so the fog stays exactly where the
  // player left it and a retry re-enters the same stage.
  const episodeProgress = failed
    ? {
        activeEpisodeId: node.episodeId,
        unlockedEpisodeIds: rewarded.unlockedEpisodeIds,
        completedEpisodeIds: rewarded.completedEpisodeIds,
        progression: [] as readonly RunProgressionEvent[],
      }
    : advanceEpisodeProgress(rewarded, input.strip, node, nodeIndex);
  const nextState: RunState = {
    ...rewarded,
    activeEpisodeId: episodeProgress.activeEpisodeId,
    unlockedEpisodeIds: episodeProgress.unlockedEpisodeIds,
    completedEpisodeIds: episodeProgress.completedEpisodeIds,
    retryCount: retryAllowed ? rewarded.retryCount + 1 : rewarded.retryCount,
    stress: retryAllowed
      ? Math.max(rewarded.stress, input.retryStressRestore ?? DEFAULT_RETRY_STRESS_RESTORE)
      : rewarded.stress,
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
    terminal: (failed && !retryAllowed) || isRunStripComplete(input.strip, nodeIndex),
  };
  return {
    state: nextState,
    retryAllowed,
    rewardChoices: rewardResult.choices,
    grade: grade.grade,
    appliedFlags: flagResult.applied,
    progression: episodeProgress.progression,
  };
}

/**
 * HP is the run's own life, not an interrogation resource, so it has to be
 * judged wherever it can reach zero — an event cost drains it just as a lost
 * interrogation does. Returning the reason rather than a boolean keeps the
 * defeat screen data-driven.
 */
export function evaluateRunFailure(state: RunState): 'STRESS_DEPLETED' | undefined {
  return state.stress <= 0 ? 'STRESS_DEPLETED' : undefined;
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

/**
 * Structural view over both authored effect schemas. Patterns A/C still author
 * the broad EffectSchema while D/E/F author the narrow RunEffectSchema, and one
 * reducer must give both the same run semantics.
 */
interface RunApplicableEffect {
  readonly type: Effect['type'];
  readonly target?: string | undefined;
  readonly resource?: string | undefined;
  readonly delta?: number | undefined;
  readonly value?: unknown;
  readonly to?: Grade | undefined;
}

function adjustRunResource(
  state: RunState,
  resource: string | undefined,
  delta: number | undefined,
): RunState {
  if (delta === undefined) return state;
  const bounds = state.resourceBounds;
  switch (resource) {
    case 'stress':
      return { ...state, stress: clampRunResource(state.stress + delta, bounds.stressMax) };
    case 'dp':
      return { ...state, dp: clampRunResource(state.dp + delta, bounds.dpMax) };
    case 'trust':
      return { ...state, trust: clampRunResource(state.trust + delta, bounds.trustMax) };
    default:
      return state;
  }
}

/**
 * Vite injects `import.meta.env`; the tools tsconfig and plain node do not, so
 * the shape is read defensively instead of assuming the bundler's globals.
 */
interface DevEnvironmentMeta {
  readonly env?: { readonly DEV?: boolean };
}

function isDevBuild(): boolean {
  return (import.meta as unknown as DevEnvironmentMeta).env?.DEV === true;
}

function scalarFlagValue(value: unknown): FlagValue | undefined {
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Every mutation lands on a local copy, so a rejected effect leaves the caller's
 * state untouched instead of committing the prefix that already succeeded.
 */
function applyRunEffects(
  state: RunState,
  effects: readonly RunApplicableEffect[],
): RunState {
  let next = state;
  for (const effect of effects) {
    switch (effect.type) {
      case 'GRANT_EVIDENCE': {
        if (effect.target === undefined) break;
        next = {
          ...next,
          acquiredEvidenceIds: appendUnique(next.acquiredEvidenceIds, effect.target),
        };
        break;
      }
      case 'ADJUST_RESOURCE': {
        next = adjustRunResource(next, effect.resource, effect.delta);
        break;
      }
      case 'UPGRADE_EVIDENCE': {
        const { target, to } = effect;
        if (target === undefined || to === undefined) {
          throw new Error(
            'UPGRADE_EVIDENCE requires a target evidence ID and a destination grade.',
          );
        }
        if (!next.acquiredEvidenceIds.includes(target)) {
          throw new Error(`Cannot upgrade evidence ${target} before the run acquires it.`);
        }
        next = {
          ...next,
          evidenceGradeById: { ...next.evidenceGradeById, [target]: to },
        };
        break;
      }
      case 'OPEN_ROUTE': {
        if (effect.target === undefined) {
          throw new Error('OPEN_ROUTE requires a target route ID.');
        }
        next = { ...next, openRouteIds: appendUnique(next.openRouteIds, effect.target) };
        break;
      }
      case 'SET_FLAG': {
        const { target } = effect;
        if (target === undefined) throw new Error('SET_FLAG requires a target flag ID.');
        const value = scalarFlagValue(effect.value);
        if (value === undefined) {
          throw new Error(`SET_FLAG ${target} requires a scalar flag value.`);
        }
        next = { ...next, flags: withFlag(next.flags, target, value) };
        break;
      }
      default: {
        // Silently discarding authored effects has already cost this codebase
        // several shipped features; make the remaining gaps audible in dev.
        if (isDevBuild()) {
          console.warn(
            `applyRunEffects: unhandled effect type "${effect.type}" was dropped.`,
          );
        }
      }
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

type EnhanceCardEvent = Extract<NonCombatEventDefinition, { pattern: 'D' }>;
type EnhanceCardOption = EnhanceCardEvent['options'][number];

function ownedCardIds(deck: RunDeckState): readonly string[] {
  return [
    ...new Set([
      ...deck.drawPile,
      ...deck.hand,
      ...deck.discardPile,
      ...deck.exhaustPile,
    ]),
  ];
}

/**
 * The engine never reads card content, so an option that filters by intent needs
 * the app-supplied lookup. Without it nothing is eligible, which routes the node
 * to the authored fallback rather than tuning an unverified card.
 */
function eligibleTuningCardIds(
  state: RunState,
  option: EnhanceCardOption,
  cardIntentsById: Readonly<Record<string, ActionIntent>> | undefined,
): readonly string[] {
  const owned = ownedCardIds(state.deck);
  if (option.eligible_intents.length === 0) return owned;
  if (cardIntentsById === undefined) return [];
  const allowed = new Set<ActionIntent>(option.eligible_intents);
  return owned.filter((cardId) => {
    const intent = cardIntentsById[cardId];
    return intent !== undefined && allowed.has(intent);
  });
}

function clampTuningDelta(value: number): number {
  return Math.min(MAX_ABS_CARD_TUNING, Math.max(-MAX_ABS_CARD_TUNING, value));
}

/** Repeat enhancements accumulate; the deck stores IDs, so every copy is tuned. */
function accumulateCardTuning(
  tuning: Readonly<Record<string, CardTuning>>,
  cardId: string,
  option: EnhanceCardOption['tuning'],
): Readonly<Record<string, CardTuning>> {
  const current = tuning[cardId];
  return {
    ...tuning,
    [cardId]: {
      cpDelta: clampTuningDelta((current?.cpDelta ?? 0) + (option.cp_delta ?? 0)),
      composureDamageDelta: clampTuningDelta(
        (current?.composureDamageDelta ?? 0) + (option.composure_damage_delta ?? 0),
      ),
      coercionDelta: clampTuningDelta(
        (current?.coercionDelta ?? 0) + (option.coercion_delta ?? 0),
      ),
    },
  };
}

function applyEnhanceCardEvent(
  state: RunState,
  event: EnhanceCardEvent,
  input: CompleteEventNodeInput,
): RunState {
  const option = input.optionId === undefined
    ? undefined
    : event.options.find((candidate) => candidate.option_id === input.optionId);
  if (input.optionId !== undefined && option === undefined) {
    throw new Error(`Unknown enhancement option ${input.optionId}.`);
  }
  const considered = option === undefined ? event.options : [option];
  const anyEligible = considered.some(
    (candidate) =>
      eligibleTuningCardIds(state, candidate, input.cardIntentsById).length > 0,
  );
  // Soft-lock prevention: a node with no tunable card still completes, paying
  // the authored fallback instead of charging for a tuning that cannot happen.
  if (!anyEligible) return applyRunEffects(state, event.fallback_gains);
  if (option === undefined) return state;

  const cardId = input.tunedCardId;
  if (cardId === undefined) {
    throw new Error('Pattern D completion requires the card its option tunes.');
  }
  if (!eligibleTuningCardIds(state, option, input.cardIntentsById).includes(cardId)) {
    throw new Error(
      `Card ${cardId} is not eligible for enhancement option ${option.option_id}.`,
    );
  }
  const paid = applyRunCost(state, option.costs);
  return applyRunEffects(
    { ...paid, cardTuning: accumulateCardTuning(paid.cardTuning, cardId, option.tuning) },
    option.effects,
  );
}

function applyCanvassEvent(
  state: RunState,
  event: Extract<NonCombatEventDefinition, { pattern: 'E' }>,
  topicIds: readonly string[],
): RunState {
  if (topicIds.length > event.attempt_limit || new Set(topicIds).size !== topicIds.length) {
    throw new Error('Pattern E canvassing exceeds its unique attempt limit.');
  }
  let next = state;
  for (const topicId of topicIds) {
    const topic = event.topics.find((candidate) => candidate.topic_id === topicId);
    if (topic === undefined) throw new Error(`Unknown canvass topic ${topicId}.`);
    if (next.canvassedTopicIds.includes(topicId)) {
      throw new Error(`Topic ${topicId} was already canvassed in this run.`);
    }
    next = applyRunEffects(applyRunCost(next, event.per_attempt_costs), topic.effects);
    next = { ...next, canvassedTopicIds: [...next.canvassedTopicIds, topicId] };
  }
  return next;
}

function applyCollectEvidenceEvent(
  state: RunState,
  event: Extract<NonCombatEventDefinition, { pattern: 'F' }>,
  targetIds: readonly string[],
): RunState {
  if (targetIds.length > event.attempt_limit || new Set(targetIds).size !== targetIds.length) {
    throw new Error('Pattern F collection exceeds its unique attempt limit.');
  }
  let next = state;
  for (const targetId of targetIds) {
    const target = event.targets.find((candidate) => candidate.target_id === targetId);
    if (target === undefined) throw new Error(`Unknown collection target ${targetId}.`);
    if (next.acquiredEvidenceIds.includes(target.evidence_id)) {
      throw new Error(`Evidence ${target.evidence_id} is already in the pouch.`);
    }
    // Authored order: cost, acquire, grade override, then the target's effects,
    // so an effect may upgrade the evidence this same target just collected.
    const paid = applyRunCost(next, event.per_attempt_costs);
    next = applyRunEffects(
      {
        ...paid,
        acquiredEvidenceIds: [...paid.acquiredEvidenceIds, target.evidence_id],
        evidenceGradeById: {
          ...paid.evidenceGradeById,
          [target.evidence_id]: target.grade,
        },
      },
      target.effects,
    );
  }
  return next;
}

function applyStagedCutsceneOutcome(
  state: RunState,
  outcome: StagedCutsceneOutcome | undefined,
): RunState {
  if (outcome === undefined) return state;
  let next = applyRunEffects(state, outcome.gains);
  for (const [flagId, value] of Object.entries(outcome.flags)) {
    next = { ...next, flags: withFlag(next.flags, flagId, value) };
  }
  return next;
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
  // Cutscene branches land before the node's own effects, so authored flag
  // hooks keep the last word exactly as they do for a pattern A choice.
  state = applyStagedCutsceneOutcome(state, input.cutsceneOutcome);
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
  if (event.pattern === 'D') {
    return { state: applyEnhanceCardEvent(state, event, input) };
  }
  if (event.pattern === 'E') {
    return { state: applyCanvassEvent(state, event, input.canvassedTopicIds ?? []) };
  }
  return {
    state: applyCollectEvidenceEvent(state, event, input.collectedTargetIds ?? []),
  };
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
  const episodeProgress = advanceEpisodeProgress(
    appliedEvent.state,
    input.strip,
    node,
    nodeIndex,
  );
  // An event that spent the last of the detective's HP ends the run here. The
  // strip having more nodes left is irrelevant: there is nobody to walk them.
  const failure = evaluateRunFailure(appliedEvent.state);
  return {
    state: {
      ...appliedEvent.state,
      nodeIndex,
      flags: flagResult.store,
      completedNodeIds: [...appliedEvent.state.completedNodeIds, node.nodeId],
      activeEpisodeId: episodeProgress.activeEpisodeId,
      unlockedEpisodeIds: episodeProgress.unlockedEpisodeIds,
      completedEpisodeIds: episodeProgress.completedEpisodeIds,
      terminal: failure !== undefined || isRunStripComplete(input.strip, nodeIndex),
    },
    ...(failure === undefined ? {} : { failureReason: failure }),
    appliedFlags: flagResult.applied,
    progression: episodeProgress.progression,
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
    if (
      (reward.type === 'RELIC' && state.acquiredRelicIds.includes(referenceId)) ||
      (reward.type === 'ENHANCEMENT' && state.acquiredEnhancementIds.includes(referenceId))
    ) {
      throw new Error(
        `Reward ${reward.reward_id} grants ${referenceId}, which the run already holds.`,
      );
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
    stress: clampRunResource(stress, state.resourceBounds.stressMax),
    dp: clampRunResource(dp, state.resourceBounds.dpMax),
    trust: clampRunResource(trust, state.resourceBounds.trustMax),
    deck,
    acquiredRelicIds,
    acquiredEnhancementIds,
    pendingRewardIds: [],
    claimedRewardIds: appendUnique(state.claimedRewardIds, reward.reward_id),
  };
}
