import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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
  type EncounterDefinition,
} from '../../src/engine/domain';
import { EncounterCoordinator } from '../../src/engine/encounter/EncounterCoordinator';
import { createRngState } from '../../src/engine/rng';
import {
  createNodeStrip,
  runEpisodeIds,
  type EncounterGradeMetrics,
} from '../../src/engine/run';
import { createRunSession, type RunSession } from '../../src/app/createRunSession';
import {
  createInitialGameRunState,
  endingIdForRun,
  rewardRarityForOutcome,
} from '../../src/app/gameRunState';
import { restoreRunState, SaveRepository } from '../../src/app/save';
import {
  getSimulationEncounter,
  SIMULATION_ARCHETYPES,
  simulateRoute,
  type SimulationAction,
  type SimulationArchetype,
} from '../../tools/simulate/routeSimulator';

function common(file: string): unknown {
  return JSON.parse(readFileSync(
    new URL(`../../content/common/${file}`, import.meta.url),
    'utf8',
  )) as unknown;
}

function caseContent(directory: string): CaseDefinition {
  return CaseSchema.parse(JSON.parse(readFileSync(
    new URL(`../../content/cases/${directory}/case.json`, import.meta.url),
    'utf8',
  )) as unknown);
}

/** Canonical route: every episode slot takes its first candidate. */
const STRIP = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
const EPISODE_IDS = runEpisodeIds(STRIP);
const FLAGS = FlagsSchema.parse(common('flags.json'));
const REWARDS = RewardsSchema.parse(common('rewards.json'));
const GRADES = GradesSchema.parse(common('grades.json'));
const CARDS = CardsSchema.parse(common('cards.json'));

function cardIntentsById(): Readonly<Record<string, ActionIntent>> {
  return Object.fromEntries(CARDS.cards.map((card) => [card.card_id, card.intent]));
}

function eligibleCards(
  session: RunSession,
  option: Readonly<{ eligible_intents: readonly ActionIntent[] }>,
  intents: Readonly<Record<string, ActionIntent>>,
): readonly string[] {
  const deck = session.snapshot.deck;
  const owned = [
    ...deck.drawPile,
    ...deck.hand,
    ...deck.discardPile,
    ...deck.exhaustPile,
  ].filter((cardId, index, ids) => ids.indexOf(cardId) === index);
  if (option.eligible_intents.length === 0) return owned;
  const allowed = new Set<ActionIntent>(option.eligible_intents);
  return owned.filter((cardId) => {
    const intent = intents[cardId];
    return intent !== undefined && allowed.has(intent);
  });
}
const BALANCE = BalanceSchema.parse(common('balance.json'));
const CASES = {
  tutorial: caseContent('tutorial'),
  ep001: caseContent('ep001'),
  ep004: caseContent('ep004'),
} as const;
const CASE_IDS_BY_DIRECTORY = Object.fromEntries(
  Object.entries(CASES).map(([directory, definition]) => [
    directory,
    definition.case_id,
  ]),
);
const CONTENT_VERSIONS_BY_DIRECTORY = Object.fromEntries(
  Object.entries(CASES).map(([directory, definition]) => [
    directory,
    definition.metadata.content_version ?? definition.schema_version,
  ]),
);

/** Audit §BLK-1 seeds: all but 2026 previously soft-locked mid-run. */
const BLK1_AUDIT_SEEDS = [20_260_805, 1, 7, 42, 999, 2_026] as const;

/**
 * The resolved canonical route: 3 episodes x (COMBAT, EVENT, BOSS).
 * Spelled out rather than derived from STRIP so the shipped run-strip content
 * cannot silently change what this end-to-end run actually plays.
 */
const CANONICAL_ROUTE_NODE_IDS = [
  'run_tutorial_01', 'run_tutorial_02', 'run_tutorial_05',
  'run_ep001_01', 'run_ep001_02', 'run_ep001_05',
  'run_ep004_01', 'run_ep004_02', 'run_ep004_05',
] as const;

const RUN_NODE_COUNT = CANONICAL_ROUTE_NODE_IDS.length;
/** Non-EVENT nodes: the only ones that produce grade/outcome records. */
const GRADED_NODE_COUNT = 6;

/**
 * Flags the canonical route actually writes, in flags.json order.
 *
 * Re-derived for the episode strip: a run now visits one candidate per slot, so
 * the writers sitting on the unplayed candidates are never reached —
 * F-04 (event_tutorial_placement), F-05 (enc_tutorial_harpy),
 * F-09 (event_ep001_warehouse), F-10 (enc_ep001_orc) and
 * F-12 (event_ep004_broker_canvass) are off-route. F-01 stays false because it
 * is the coerced-confession writer on enc_tutorial_slime.
 * The true ending only requires F-13 (enc_ep004_fallen_hero BEST_RESOLUTION),
 * which is a FIXED BOSS slot, so it remains reachable on every route.
 */
const CANONICAL_ROUTE_SET_FLAG_IDS = [
  'F-02', 'F-03', 'F-06', 'F-07', 'F-08', 'F-11', 'F-13',
] as const;

const CANONICAL_ROUTE_UNSET_FLAG_IDS = [
  'F-01', 'F-04', 'F-05', 'F-09', 'F-10', 'F-12',
] as const;

function enabledFlagIds(flags: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.entries(flags)
    .filter(([, value]) => value === true)
    .map(([flagId]) => flagId)
    .sort();
}

function archetypeForEncounter(encounterId: string): SimulationArchetype {
  const archetype = SIMULATION_ARCHETYPES.find(
    (candidate) => getSimulationEncounter(candidate).encounterId === encounterId,
  );
  if (archetype === undefined) {
    throw new Error(`No simulation archetype covers encounter ${encounterId}.`);
  }
  return archetype;
}

function completionRatio(
  objectives: readonly Readonly<{ completed: boolean }>[],
): number {
  if (objectives.length === 0) return 1;
  return objectives.filter((objective) => objective.completed).length /
    objectives.length;
}

/**
 * Replays the coordinator inputs recorded by simulateRoute on a fresh
 * coordinator seeded identically, so the terminal snapshot is available for
 * honest grade metrics instead of hardcoded perfect values.
 */
function replayBestRoute(
  definition: CaseDefinition,
  encounterId: string,
  seed: number,
  actions: readonly SimulationAction[],
): EncounterCoordinator {
  const coordinator = EncounterCoordinator.begin({
    caseDefinition: definition,
    encounterId,
    cards: CARDS.cards,
    balance: BALANCE,
    rng: createRngState(seed, 'DECK_SHUFFLE'),
    ...(CARDS.initial_deck === undefined
      ? {}
      : { initialDeckCardIds: CARDS.initial_deck }),
  });
  for (const action of actions) {
    if (action.kind === 'SUBMIT') {
      if (coordinator.snapshot.machine.state === 'FREE_REVIEW') {
        coordinator.review();
        coordinator.beginArgument();
      }
      const card = CARDS.cards.find(
        (candidate) => candidate.card_id === action.cardId,
      );
      if (card === undefined) {
        throw new Error(`Unknown replay card ${action.cardId}.`);
      }
      // The simulator only omitted targetClaimId for non-CLAIM card targets
      // outside route submissions; mirroring that keeps the replay identical.
      const includeTarget =
        action.routeId !== undefined || card.target.kind === 'CLAIM';
      const submission = coordinator.submit({
        cardId: action.cardId,
        ...(includeTarget ? { targetClaimId: action.claimId } : {}),
        ...(action.routeId === undefined ? {} : { routeId: action.routeId }),
        evidenceIds: [...action.evidenceIds],
      });
      if (action.resolutionCode !== undefined) {
        expect(submission.resolution.code).toBe(action.resolutionCode);
      }
    } else if (action.kind === 'SECURE_STATEMENT') {
      coordinator.secureStatement();
    } else if (action.kind === 'END_TURN') {
      coordinator.endTurn();
    } else {
      throw new Error(`Unsupported replay action ${action.kind}.`);
    }
  }
  return coordinator;
}

/** Mirrors encounterGradeMetrics(session) in src/app/gameRunState.ts. */
function honestGradeMetrics(
  coordinator: EncounterCoordinator,
  encounter: EncounterDefinition,
): EncounterGradeMetrics {
  const snapshot = coordinator.snapshot;
  const conditions = encounter.objectives.state_conditions;
  const sweetSpot = coordinator.sweetSpot;
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

interface FullRunResult {
  readonly session: RunSession;
  readonly repository: SaveRepository;
}

function playFullRun(seed: number): FullRunResult {
  // The save repository must stay attached: the browser saves at every node
  // boundary, and omitting it once hid the duplicate-reward soft-lock (BLK-1).
  const values = new Map<string, string>();
  const repository = new SaveRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  const session = createRunSession({
    initialState: createInitialGameRunState(CARDS, BALANCE, FLAGS, seed, EPISODE_IDS),
    strip: STRIP,
    flags: FLAGS.flags,
    rewards: REWARDS,
    grades: GRADES,
    saveRepository: repository,
    caseIdsByDirectory: CASE_IDS_BY_DIRECTORY,
    contentVersionsByDirectory: CONTENT_VERSIONS_BY_DIRECTORY,
  });

  while (!session.snapshot.terminal && session.snapshot.nodeIndex < STRIP.length) {
    const node = STRIP[session.snapshot.nodeIndex];
    if (node === undefined) throw new Error('Run strip ended unexpectedly.');
    const definition = CASES[node.caseDirectory as keyof typeof CASES];

    if (node.kind === 'EVENT') {
      const event = definition.events_noncombat.find(
        (candidate) => candidate.event_id === node.ref,
      );
      if (event === undefined) throw new Error(`Missing event ${node.ref}.`);
      if (event.pattern === 'A') {
        const choiceId = event.choices[0]?.choice_id;
        if (choiceId === undefined) {
          throw new Error(`Event ${event.event_id} has no choice.`);
        }
        session.finishEvent({ eventDefinition: event, choiceId });
      } else if (event.pattern === 'B') {
        session.finishEvent({
          eventDefinition: event,
          placement: { ...event.answer_mapping },
        });
      } else if (event.pattern === 'C') {
        session.finishEvent({
          eventDefinition: event,
          investigatedSpotIds: event.spots
            .slice(0, event.attempt_limit)
            .map((spot) => spot.spot_id),
        });
      } else if (event.pattern === 'D') {
        const cardIntents = cardIntentsById();
        const option = event.options.find(
          (candidate) => eligibleCards(session, candidate, cardIntents).length > 0,
        );
        const tunedCardId = option === undefined
          ? undefined
          : eligibleCards(session, option, cardIntents)[0];
        session.finishEvent({
          eventDefinition: event,
          cardIntentsById: cardIntents,
          ...(option === undefined || tunedCardId === undefined
            ? {}
            : { optionId: option.option_id, tunedCardId }),
        });
      } else if (event.pattern === 'E') {
        // Topic order matters: the route topic is the only writer of F-12, and
        // the attempt limit is smaller than the topic list on purpose.
        const canvassed = new Set(session.snapshot.canvassedTopicIds);
        session.finishEvent({
          eventDefinition: event,
          canvassedTopicIds: event.topics
            .filter((topic) => !canvassed.has(topic.topic_id))
            .slice(0, event.attempt_limit)
            .map((topic) => topic.topic_id),
        });
      } else {
        const held = new Set(session.snapshot.acquiredEvidenceIds);
        session.finishEvent({
          eventDefinition: event,
          collectedTargetIds: event.targets
            .filter((target) => !held.has(target.evidence_id))
            .slice(0, event.attempt_limit)
            .map((target) => target.target_id),
        });
      }
      continue;
    }

    const encounterDefinition = definition.encounters.find(
      (candidate) => candidate.encounter_id === node.ref,
    );
    if (encounterDefinition === undefined) {
      throw new Error(`Missing encounter ${node.ref}.`);
    }
    const archetype = archetypeForEncounter(node.ref);
    const simulated = simulateRoute(archetype, 'BEST_RESOLUTION', { seed });
    expect(simulated.outcome).toBe('BEST_RESOLUTION');
    const coordinator = replayBestRoute(
      definition,
      node.ref,
      seed,
      simulated.inputSequence,
    );
    expect(coordinator.snapshot.outcome).toBe('BEST_RESOLUTION');

    const authoredOutcome = encounterDefinition.outcomes
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
      gradeMetrics: honestGradeMetrics(coordinator, encounterDefinition),
      ...(authoredOutcome?.rewards === undefined
        ? {}
        : { outcomeRewards: authoredOutcome.rewards }),
    });
    expect(completion.rewardChoices.length).toBeGreaterThan(0);
    // Prefer an unclaimed reward; claiming validates through the save schema
    // because the attached repository serializes every boundary.
    const preferred = completion.rewardChoices.find(
      (reward) => !session.snapshot.claimedRewardIds.includes(reward.reward_id),
    ) ?? completion.rewardChoices[0];
    if (preferred === undefined) {
      throw new Error('BEST encounter must offer a reward.');
    }
    session.claimReward(preferred.reward_id);
  }

  return { session, repository };
}

describe('L1 headless full run (route simulator x run session)', () => {
  it('resolves the canonical 3-episode route', () => {
    expect(STRIP.map((node) => node.nodeId)).toEqual([...CANONICAL_ROUTE_NODE_IDS]);
    expect(EPISODE_IDS).toEqual(['tutorial', 'ep001', 'ep004']);
    expect(STRIP.filter((node) => node.kind !== 'EVENT')).toHaveLength(GRADED_NODE_COUNT);
  });

  it('completes all 9 nodes with honest coordinator metrics, save validation, and the true ending', () => {
    const { session, repository } = playFullRun(20_260_805);
    const state = session.snapshot;

    expect(state.nodeIndex).toBe(RUN_NODE_COUNT);
    expect(state.completedNodeIds).toHaveLength(RUN_NODE_COUNT);
    expect(state.completedNodeIds).toEqual([...CANONICAL_ROUTE_NODE_IDS]);
    expect(state.terminal).toBe(true);
    expect(state.pendingRewardIds).toEqual([]);
    expect(state.gradeHistory).toHaveLength(GRADED_NODE_COUNT);
    expect(state.outcomeHistory).toHaveLength(GRADED_NODE_COUNT);
    expect(endingIdForRun(state)).toBe('ending-true');

    // Every episode boss fell, so every episode is cleared and unlocked.
    expect(state.completedEpisodeIds).toEqual(['tutorial', 'ep001', 'ep004']);
    expect(state.unlockedEpisodeIds).toEqual(['tutorial', 'ep001', 'ep004']);
    expect(state.activeEpisodeId).toBe('ep004');

    expect(enabledFlagIds(state.flags)).toEqual([...CANONICAL_ROUTE_SET_FLAG_IDS]);
    for (const flagId of CANONICAL_ROUTE_SET_FLAG_IDS) {
      expect(state.flags[flagId], `${flagId} must be set`).toBe(true);
    }
    for (const flagId of CANONICAL_ROUTE_UNSET_FLAG_IDS) {
      expect(state.flags[flagId], `${flagId} is off the canonical route`).toBe(false);
    }

    const saved = repository.load();
    if (saved === undefined) throw new Error('Saved run data must reload.');
    expect(saved.run?.node_index).toBe(RUN_NODE_COUNT);
    expect(saved.run?.terminal).toBe(true);
    expect(saved.run?.grade_history).toHaveLength(GRADED_NODE_COUNT);
    expect(saved.run?.route_node_ids).toEqual([...CANONICAL_ROUTE_NODE_IDS]);
    expect(saved.run?.active_episode_id).toBe('ep004');
    expect(saved.run?.completed_episode_ids).toEqual(['tutorial', 'ep001', 'ep004']);
    const restored = restoreRunState(saved, {}, STRIP);
    expect(restored.nodeIndex).toBe(RUN_NODE_COUNT);
    expect(restored.terminal).toBe(true);
    expect(restored.completedNodeIds).toEqual(state.completedNodeIds);
    expect(restored.claimedRewardIds).toEqual(state.claimedRewardIds);
    expect(restored.gradeHistory).toEqual(state.gradeHistory);
    expect(restored.activeEpisodeId).toBe(state.activeEpisodeId);
    expect(restored.unlockedEpisodeIds).toEqual(state.unlockedEpisodeIds);
    expect(restored.completedEpisodeIds).toEqual(state.completedEpisodeIds);
  });

  it.each([...BLK1_AUDIT_SEEDS])(
    'seed %d completes 9 nodes with the save repository attached',
    (seed) => {
      const { session, repository } = playFullRun(seed);
      const state = session.snapshot;

      expect(state.nodeIndex).toBe(RUN_NODE_COUNT);
      expect(state.completedNodeIds).toHaveLength(RUN_NODE_COUNT);
      expect(state.terminal).toBe(true);
      expect(state.pendingRewardIds).toEqual([]);
      expect(state.gradeHistory).toHaveLength(GRADED_NODE_COUNT);
      expect(state.completedEpisodeIds).toEqual(['tutorial', 'ep001', 'ep004']);
      expect(endingIdForRun(state)).toBe('ending-true');
      expect(repository.load()?.run?.node_index).toBe(RUN_NODE_COUNT);
    },
  );
});
