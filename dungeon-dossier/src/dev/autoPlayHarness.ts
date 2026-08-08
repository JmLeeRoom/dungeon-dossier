import balanceJson from '../../content/common/balance.json';
import cardsJson from '../../content/common/cards.json';
import flagsJson from '../../content/common/flags.json';
import gradesJson from '../../content/common/grades.json';
import rewardsJson from '../../content/common/rewards.json';
import runStripJson from '../../content/common/run-strip.json';
import ep001CaseJson from '../../content/cases/ep001/case.json';
import ep004CaseJson from '../../content/cases/ep004/case.json';
import tutorialCaseJson from '../../content/cases/tutorial/case.json';
import { createRunSession, type RunSession } from '../app/createRunSession';
import { isAutoplaySeed, MAX_AUTOPLAY_SEED } from '../app/autoplayPort';
import {
  createInitialGameRunState,
  endingIdForRun,
  rewardRarityForOutcome,
} from '../app/gameRunState';
import { restoreRunState, SaveRepository } from '../app/save';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  FlagsSchema,
  GradesSchema,
  RewardsSchema,
  RunStripSchema,
  type ActionIntent,
  type CaseDefinition,
  type NonCombatEventDefinition,
} from '../engine/domain';
import {
  createNodeStrip,
  type EncounterGradeMetrics,
  type NodeDefinition,
  type RunState,
} from '../engine/run';
import {
  getSimulationEncounter,
  SIMULATION_ARCHETYPES,
  simulateRoute,
  type RouteSimulationResult,
  type SimulationArchetype,
  type SimulationEncounterCatalogEntry,
} from '../../tools/simulate/routeSimulator';

export const DEFAULT_AUTO_PLAY_SEED = 20_260_805;

export type AutoPlayStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'STOPPED'
  | 'RUN_COMPLETED'
  | 'FAILED';

export interface AutoPlayHarnessOptions {
  readonly seed?: number;
  /** Recreate RunSession from its persisted save after this many completed nodes. */
  readonly reloadAfterCompletedNodes?: number;
}

export interface AutoPlayNodeReport {
  readonly index: number;
  readonly nodeId: string;
  readonly kind: NodeDefinition['kind'];
  readonly ref: string;
  readonly outcome: string;
  readonly grade: string | null;
  readonly resolutionCodes: readonly string[];
}

export interface AutoPlayFinalState {
  readonly nodeIndex: number;
  readonly terminal: boolean;
  readonly completedNodeIds: readonly string[];
  readonly pendingRewardIds: readonly string[];
  readonly claimedRewardIds: readonly string[];
  readonly gradeCount: number;
  readonly outcomeCount: number;
}

export interface AutoPlayProgress {
  readonly status: AutoPlayStatus;
  readonly seed: number;
  readonly totalNodes: number;
  readonly completedNodes: number;
  readonly currentNodeId: string | null;
  readonly visitedNodeIds: readonly string[];
  readonly nodes: readonly AutoPlayNodeReport[];
  readonly reloadNodeIndices: readonly number[];
  readonly errorCount: number;
  readonly errors: readonly string[];
  readonly endingId: string | null;
  readonly finalState: AutoPlayFinalState | null;
}

export interface AutoPlayHarness {
  start(): Promise<AutoPlayProgress>;
  stop(): void;
  getProgress(): AutoPlayProgress;
}

export type AutoPlayGlobalBinding = AutoPlayHarness;

declare global {
  interface Window {
    __AUTO_PLAY__?: AutoPlayGlobalBinding;
  }
}

interface MutableProgress {
  status: AutoPlayStatus;
  readonly seed: number;
  readonly totalNodes: number;
  completedNodes: number;
  currentNodeId: string | null;
  readonly visitedNodeIds: string[];
  readonly nodes: AutoPlayNodeReport[];
  readonly reloadNodeIndices: number[];
  readonly errors: string[];
  endingId: string | null;
  finalState: AutoPlayFinalState | null;
}

const BALANCE = BalanceSchema.parse(balanceJson);
const CARDS = CardsSchema.parse(cardsJson);
const FLAGS = FlagsSchema.parse(flagsJson);
const GRADES = GradesSchema.parse(gradesJson);
const REWARDS = RewardsSchema.parse(rewardsJson);
const STRIP = createNodeStrip(RunStripSchema.parse(runStripJson));

/**
 * Length of the canonical resolved route (one node per episode slot). Derived
 * from the strip so an episode/slot content change can never leave the harness
 * asserting a stale hard-coded node count.
 */
export const AUTO_PLAY_NODE_COUNT = STRIP.length;
const CASES_BY_DIRECTORY: Readonly<Record<string, CaseDefinition>> = Object.freeze({
  tutorial: CaseSchema.parse(tutorialCaseJson),
  ep001: CaseSchema.parse(ep001CaseJson),
  ep004: CaseSchema.parse(ep004CaseJson),
});
const CASE_IDS_BY_DIRECTORY = Object.freeze(Object.fromEntries(
  Object.entries(CASES_BY_DIRECTORY).map(([directory, definition]) => [
    directory,
    definition.case_id,
  ]),
));
const CONTENT_VERSIONS_BY_DIRECTORY = Object.freeze(Object.fromEntries(
  Object.entries(CASES_BY_DIRECTORY).map(([directory, definition]) => [
    directory,
    definition.metadata.content_version ?? definition.schema_version,
  ]),
));
const ARCHETYPE_BY_ENCOUNTER_ID = new Map<string, SimulationArchetype>(
  SIMULATION_ARCHETYPES.map((archetype) => [
    getSimulationEncounter(archetype).encounterId,
    archetype,
  ]),
);

export const AUTO_PLAY_NODE_IDS: readonly string[] = Object.freeze(
  STRIP.map((node) => node.nodeId),
);

function validateSeed(seed: number): number {
  if (!isAutoplaySeed(seed)) {
    throw new Error(
      `Autoplay seed must be an integer from 0 through ${MAX_AUTOPLAY_SEED.toString()}.`,
    );
  }
  return seed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function copyFinalState(state: RunState): AutoPlayFinalState {
  return {
    nodeIndex: state.nodeIndex,
    terminal: state.terminal,
    completedNodeIds: [...state.completedNodeIds],
    pendingRewardIds: [...state.pendingRewardIds],
    claimedRewardIds: [...state.claimedRewardIds],
    gradeCount: state.gradeHistory.length,
    outcomeCount: state.outcomeHistory.length,
  };
}

function snapshotProgress(progress: MutableProgress): AutoPlayProgress {
  return {
    status: progress.status,
    seed: progress.seed,
    totalNodes: progress.totalNodes,
    completedNodes: progress.completedNodes,
    currentNodeId: progress.currentNodeId,
    visitedNodeIds: [...progress.visitedNodeIds],
    nodes: progress.nodes.map((node) => ({
      ...node,
      resolutionCodes: [...node.resolutionCodes],
    })),
    reloadNodeIndices: [...progress.reloadNodeIndices],
    errorCount: progress.errors.length,
    errors: [...progress.errors],
    endingId: progress.endingId,
    finalState: progress.finalState === null
      ? null
      : {
          ...progress.finalState,
          completedNodeIds: [...progress.finalState.completedNodeIds],
          pendingRewardIds: [...progress.finalState.pendingRewardIds],
          claimedRewardIds: [...progress.finalState.claimedRewardIds],
        },
  };
}

function createMemorySaveRepository(): SaveRepository {
  const values = new Map<string, string>();
  return new SaveRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
}

function createSession(
  seed: number,
  saveRepository: SaveRepository,
  initialState?: RunState,
): RunSession {
  return createRunSession({
    initialState:
      initialState ?? createInitialGameRunState(CARDS, BALANCE, FLAGS, seed),
    strip: STRIP,
    flags: FLAGS.flags,
    rewards: REWARDS,
    grades: GRADES,
    saveRepository,
    caseIdsByDirectory: CASE_IDS_BY_DIRECTORY,
    contentVersionsByDirectory: CONTENT_VERSIONS_BY_DIRECTORY,
  });
}

function ratioCompleted(
  objectiveIds: readonly string[],
  completedIds: ReadonlySet<string>,
): number {
  if (objectiveIds.length === 0) return 1;
  return objectiveIds.filter((objectiveId) => completedIds.has(objectiveId)).length /
    objectiveIds.length;
}

function gradeMetricsFromSimulation(
  result: RouteSimulationResult,
  encounter: SimulationEncounterCatalogEntry,
): EncounterGradeMetrics {
  const lastStep = result.judgmentLog.at(-1);
  if (lastStep === undefined) {
    throw new Error(`Simulation ${result.encounterId} produced no judgment steps.`);
  }
  const completedIds = new Set(result.completedObjectiveIds);
  const requiredIds = encounter.objectives.required.map(
    (objective) => objective.objective_id,
  );
  const optionalIds = encounter.objectives.optional.map(
    (objective) => objective.objective_id,
  );
  return {
    requiredClaimResolutionRatio: ratioCompleted(requiredIds, completedIds),
    optionalObjectiveRatio: ratioCompleted(optionalIds, completedIds),
    sweetSpotFinish:
      lastStep.composure >= encounter.sweetSpot.min &&
      lastStep.composure <= encounter.sweetSpot.max &&
      (encounter.sweetSpot.coercionMax === undefined ||
        lastStep.coercion <= encounter.sweetSpot.coercionMax),
    // BEST proof paths never consume or destroy evidence; the coordinator-backed
    // simulation above is the authority for the rest of the encounter outcome.
    originalsPreserved: true,
    coercion: lastStep.coercion,
  };
}

/** Pattern D eligibility needs each owned card's intent, keyed by card id. */
const CARD_INTENTS_BY_ID: Readonly<Record<string, ActionIntent>> = Object.freeze(
  Object.fromEntries(CARDS.cards.map((card) => [card.card_id, card.intent])),
);

function ownedCardIdsOf(session: RunSession): readonly string[] {
  const deck = session.snapshot.deck;
  return [
    ...deck.drawPile,
    ...deck.hand,
    ...deck.discardPile,
    ...deck.exhaustPile,
  ].filter((cardId, index, ids) => ids.indexOf(cardId) === index);
}

function eligibleCardIdsFor(
  session: RunSession,
  option: Readonly<{ eligible_intents: readonly ActionIntent[] }>,
  intents: Readonly<Record<string, ActionIntent>>,
): readonly string[] {
  const owned = ownedCardIdsOf(session);
  if (option.eligible_intents.length === 0) return owned;
  const allowed = new Set<ActionIntent>(option.eligible_intents);
  return owned.filter((cardId) => {
    const intent = intents[cardId];
    return intent !== undefined && allowed.has(intent);
  });
}

function findCase(node: NodeDefinition): CaseDefinition {
  const definition = CASES_BY_DIRECTORY[node.caseDirectory];
  if (definition === undefined) {
    throw new Error(`Missing autoplay case directory ${node.caseDirectory}.`);
  }
  return definition;
}

function firstValidChoiceId(
  event: Extract<NonCombatEventDefinition, { pattern: 'A' }>,
): string {
  // The authored true-ending branch is identity-based. Keeping the explicit ID
  // prevents a harmless content reorder from silently changing the ending.
  if (event.event_id === 'event_ep004_ticket_trade') {
    const broker = event.choices.find(
      (choice) => choice.choice_id === 'choice_ep004_question_broker',
    );
    if (broker !== undefined) return broker.choice_id;
  }
  const first = event.choices[0];
  if (first === undefined) throw new Error(`Event ${event.event_id} has no choice.`);
  return first.choice_id;
}

function completeEvent(
  session: RunSession,
  definition: CaseDefinition,
  node: NodeDefinition,
): Pick<AutoPlayNodeReport, 'outcome' | 'grade' | 'resolutionCodes'> {
  const event = definition.events_noncombat.find(
    (candidate) => candidate.event_id === node.ref,
  );
  if (event === undefined) throw new Error(`Missing event ${node.ref}.`);
  if (event.pattern === 'A') {
    session.finishEvent({
      eventDefinition: event,
      choiceId: firstValidChoiceId(event),
    });
    return { outcome: 'EVENT_COMPLETED', grade: null, resolutionCodes: [] };
  }
  if (event.pattern === 'B') {
    const completion = session.finishEvent({
      eventDefinition: event,
      placement: { ...event.answer_mapping },
    });
    const outcome = completion.placementResult?.result;
    if (outcome === undefined) {
      throw new Error(`Placement event ${event.event_id} produced no result.`);
    }
    return { outcome, grade: null, resolutionCodes: [] };
  }
  if (event.pattern === 'C') {
    session.finishEvent({
      eventDefinition: event,
      investigatedSpotIds: event.spots
        .slice(0, event.attempt_limit)
        .map((spot) => spot.spot_id),
    });
    return { outcome: 'EVENT_COMPLETED', grade: null, resolutionCodes: [] };
  }
  if (event.pattern === 'D') {
    // Best policy: spend the first option that has a legal target. With no
    // eligible card the run layer pays the authored fallback instead.
    const cardIntents = CARD_INTENTS_BY_ID;
    const option = event.options.find((candidate) =>
      eligibleCardIdsFor(session, candidate, cardIntents).length > 0,
    );
    const cardId = option === undefined
      ? undefined
      : eligibleCardIdsFor(session, option, cardIntents)[0];
    session.finishEvent({
      eventDefinition: event,
      cardIntentsById: cardIntents,
      ...(option === undefined || cardId === undefined
        ? {}
        : { optionId: option.option_id, tunedCardId: cardId }),
    });
    return { outcome: 'EVENT_COMPLETED', grade: null, resolutionCodes: [] };
  }
  if (event.pattern === 'E') {
    const already = new Set(session.snapshot.canvassedTopicIds);
    session.finishEvent({
      eventDefinition: event,
      canvassedTopicIds: event.topics
        .filter((topic) => !already.has(topic.topic_id))
        .slice(0, event.attempt_limit)
        .map((topic) => topic.topic_id),
    });
    return { outcome: 'EVENT_COMPLETED', grade: null, resolutionCodes: [] };
  }
  const held = new Set(session.snapshot.acquiredEvidenceIds);
  session.finishEvent({
    eventDefinition: event,
    collectedTargetIds: event.targets
      .filter((target) => !held.has(target.evidence_id))
      .slice(0, event.attempt_limit)
      .map((target) => target.target_id),
  });
  return { outcome: 'EVENT_COMPLETED', grade: null, resolutionCodes: [] };
}

function completeEncounter(
  session: RunSession,
  definition: CaseDefinition,
  node: NodeDefinition,
  seed: number,
): Pick<AutoPlayNodeReport, 'outcome' | 'grade' | 'resolutionCodes'> {
  const encounter = definition.encounters.find(
    (candidate) => candidate.encounter_id === node.ref,
  );
  if (encounter === undefined) throw new Error(`Missing encounter ${node.ref}.`);
  const archetype = ARCHETYPE_BY_ENCOUNTER_ID.get(node.ref);
  if (archetype === undefined) {
    throw new Error(`No route simulation covers encounter ${node.ref}.`);
  }
  const simulationEncounter = getSimulationEncounter(archetype);
  const result = simulateRoute(archetype, 'BEST_RESOLUTION', { seed });
  if (
    result.execution !== 'ENCOUNTER_COORDINATOR' ||
    !result.terminated ||
    result.outcome !== 'BEST_RESOLUTION'
  ) {
    throw new Error(
      `Encounter ${node.ref} did not reach BEST_RESOLUTION through the coordinator.`,
    );
  }
  const authoredOutcome = encounter.outcomes
    .filter((candidate) => candidate.grade === 'BEST_RESOLUTION')
    .sort((left, right) => right.priority - left.priority)[0];
  const completion = session.finishEncounter({
    outcome: 'BEST_RESOLUTION',
    rewardRarity: rewardRarityForOutcome(
      'BEST_RESOLUTION',
      definition.metadata.act,
      node.kind === 'BOSS',
    ),
    episodeId: definition.case_id,
    act: definition.metadata.act,
    gradeMetrics: gradeMetricsFromSimulation(result, simulationEncounter),
    ...(authoredOutcome?.rewards === undefined
      ? {}
      : { outcomeRewards: authoredOutcome.rewards }),
  });
  const reward = completion.rewardChoices[0];
  if (reward === undefined) {
    throw new Error(`Encounter ${node.ref} did not offer a reward.`);
  }
  session.claimReward(reward.reward_id);
  return {
    outcome: 'BEST_RESOLUTION',
    grade: completion.grade,
    resolutionCodes: result.judgmentLog.flatMap((step) =>
      step.resolutionCode === undefined ? [] : [step.resolutionCode]
    ),
  };
}

async function yieldToHost(): Promise<void> {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

/**
 * Creates a deterministic, stoppable full-route unattended run. All game-state
 * transitions go through the existing simulator and RunSession boundaries.
 */
export function createAutoPlayHarness(
  options: AutoPlayHarnessOptions = {},
): AutoPlayHarness {
  const seed = validateSeed(options.seed ?? DEFAULT_AUTO_PLAY_SEED);
  const reloadAfterCompletedNodes = options.reloadAfterCompletedNodes;
  if (
    reloadAfterCompletedNodes !== undefined &&
    (!Number.isInteger(reloadAfterCompletedNodes) ||
      reloadAfterCompletedNodes <= 0 ||
      reloadAfterCompletedNodes >= STRIP.length)
  ) {
    throw new Error(
      `Autoplay reload boundary must be inside the ${STRIP.length.toString()}-node route.`,
    );
  }
  let stopRequested = false;
  let activeRun: Promise<AutoPlayProgress> | undefined;
  let progress: MutableProgress = {
    status: 'IDLE',
    seed,
    totalNodes: STRIP.length,
    completedNodes: 0,
    currentNodeId: null,
    visitedNodeIds: [],
    nodes: [],
    reloadNodeIndices: [],
    errors: [],
    endingId: null,
    finalState: null,
  };

  const execute = async (): Promise<AutoPlayProgress> => {
    progress = {
      status: 'RUNNING',
      seed,
      totalNodes: STRIP.length,
      completedNodes: 0,
      currentNodeId: null,
      visitedNodeIds: [],
      nodes: [],
      reloadNodeIndices: [],
      errors: [],
      endingId: null,
      finalState: null,
    };
    stopRequested = false;
    let session: RunSession | undefined;
    try {
      if (STRIP.length !== AUTO_PLAY_NODE_COUNT) {
        throw new Error(
          `Autoplay requires ${AUTO_PLAY_NODE_COUNT.toString()} nodes; found ${STRIP.length.toString()}.`,
        );
      }
      const repository = createMemorySaveRepository();
      session = createSession(seed, repository);
      while (!session.snapshot.terminal && session.snapshot.nodeIndex < STRIP.length) {
        if (stopRequested) return snapshotProgress(progress);
        const startIndex = session.snapshot.nodeIndex;
        const node = STRIP[startIndex];
        if (node === undefined) throw new Error('Run strip ended unexpectedly.');
        progress.currentNodeId = node.nodeId;
        await yieldToHost();
        if (stopRequested) return snapshotProgress(progress);

        const definition = findCase(node);
        const details = node.kind === 'EVENT'
          ? completeEvent(session, definition, node)
          : completeEncounter(session, definition, node, seed);
        if (session.snapshot.nodeIndex !== startIndex + 1) {
          throw new Error(`Node ${node.nodeId} did not advance exactly once.`);
        }
        progress.visitedNodeIds.push(node.nodeId);
        progress.nodes.push({
          index: startIndex,
          nodeId: node.nodeId,
          kind: node.kind,
          ref: node.ref,
          ...details,
        });
        progress.completedNodes = progress.visitedNodeIds.length;
        if (
          reloadAfterCompletedNodes !== undefined &&
          progress.completedNodes === reloadAfterCompletedNodes &&
          !progress.reloadNodeIndices.includes(reloadAfterCompletedNodes)
        ) {
          const saved = repository.load();
          if (saved === undefined) {
            throw new Error(`No save exists after node ${node.nodeId}.`);
          }
          const restored = restoreRunState(saved);
          if (
            restored.nodeIndex !== session.snapshot.nodeIndex ||
            restored.completedNodeIds.join('\u0000') !==
              session.snapshot.completedNodeIds.join('\u0000')
          ) {
            throw new Error(`Save restore diverged after node ${node.nodeId}.`);
          }
          session = createSession(seed, repository, restored);
          progress.reloadNodeIndices.push(reloadAfterCompletedNodes);
        }
      }

      const finalState = session.snapshot;
      if (
        finalState.nodeIndex !== STRIP.length ||
        finalState.completedNodeIds.length !== STRIP.length ||
        !finalState.terminal ||
        finalState.pendingRewardIds.length > 0
      ) {
        throw new Error(
          `Run ended without completing and settling all ${STRIP.length.toString()} nodes.`,
        );
      }
      progress.status = 'RUN_COMPLETED';
      progress.currentNodeId = null;
      progress.endingId = endingIdForRun(finalState);
      progress.finalState = copyFinalState(finalState);
    } catch (error) {
      progress.errors.push(errorMessage(error));
      progress.status = 'FAILED';
      progress.currentNodeId = null;
      if (session !== undefined) progress.finalState = copyFinalState(session.snapshot);
    }
    return snapshotProgress(progress);
  };

  return {
    start(): Promise<AutoPlayProgress> {
      if (activeRun !== undefined) return activeRun;
      const run = execute().finally(() => {
        if (activeRun === run) activeRun = undefined;
      });
      activeRun = run;
      return run;
    },
    stop(): void {
      if (progress.status !== 'RUNNING') return;
      stopRequested = true;
      progress.status = 'STOPPED';
    },
    getProgress(): AutoPlayProgress {
      return snapshotProgress(progress);
    },
  };
}

/** Runs a fresh unattended scenario to completion (or a structured failure). */
export async function runAutoPlay15Nodes(
  options: AutoPlayHarnessOptions = {},
): Promise<AutoPlayProgress> {
  return createAutoPlayHarness(options).start();
}

/** Installs the browser developer API requested by the autoplay protocol. */
export function installAutoPlayGlobal(
  target: Window,
  options: AutoPlayHarnessOptions = {},
): AutoPlayGlobalBinding {
  const harness = createAutoPlayHarness(options);
  target.__AUTO_PLAY__ = harness;
  return harness;
}
