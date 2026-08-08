import {
  CURRENT_SAVE_VERSION,
  LEGACY_EPISODE_PLACEHOLDER,
  type SaveData,
} from '../../content-io';
import {
  createRunState,
  DEFAULT_RETRY_LIMIT,
  deriveEpisodeProgress,
  type NodeDefinition,
  type RunResourceBounds,
  type RunState,
} from '../../engine/run';
import type { SaveRepository } from './SaveRepository';

export interface RunSaveMetadata {
  readonly caseId: string;
  readonly contentVersion: string;
  /**
   * Node IDs of the route this run resolved. Persisting them means a later
   * candidate-pool edit cannot silently move an in-flight save to a different
   * set of nodes, which re-deriving from the seed alone would allow.
   */
  readonly routeNodeIds: readonly string[];
}

export interface RestoredRunStateCatalog {
  readonly strip: readonly NodeDefinition[];
  /** Retries this build allows; a save at the cap is a terminal defeat. */
  readonly retryLimit?: number;
  readonly cardIds: readonly string[];
  readonly rewardIds: readonly string[];
  readonly relicIds: readonly string[];
  readonly enhancementIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly flagIds: readonly string[];
}

export interface RestoredRunSaveCatalog extends RestoredRunStateCatalog {
  /** Metadata written by RunSession for the node boundary being resumed. */
  readonly caseIdsByDirectory: Readonly<Record<string, string>>;
  readonly contentVersionsByDirectory: Readonly<Record<string, string>>;
}

function sameOrderedValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function assertKnownIds(
  label: string,
  values: readonly string[],
  knownValues: readonly string[],
): void {
  const known = new Set(knownValues);
  const unknown = values.find((value) => !known.has(value));
  if (unknown !== undefined) {
    throw new Error(`Saved ${label} contains unknown ID ${unknown}.`);
  }
}

/**
 * Cross-checks schema-valid save data against the currently loaded catalogues.
 * Zod establishes shape; these invariants prevent a hostile or stale save from
 * skipping strip nodes, inventing catalogue IDs, or forging terminal state.
 */
export function assertRestoredRunStateSemantics(
  state: RunState,
  catalog: RestoredRunStateCatalog,
): void {
  const { strip } = catalog;
  if (
    !Number.isInteger(state.nodeIndex) ||
    state.nodeIndex < 0 ||
    state.nodeIndex > strip.length
  ) {
    throw new Error('Saved run position is outside the canonical strip.');
  }

  const expectedCompletedNodeIds = strip
    .slice(0, state.nodeIndex)
    .map((node) => node.nodeId);
  if (!sameOrderedValues(state.completedNodeIds, expectedCompletedNodeIds)) {
    throw new Error('Saved completed nodes do not match the canonical strip prefix.');
  }

  const failedAtCurrentNode =
    state.nodeIndex < strip.length &&
    state.outcomeHistory.at(-1)?.outcome === 'FAILED';
  if (failedAtCurrentNode) {
    const currentNode = strip[state.nodeIndex];
    const failedRecord = state.outcomeHistory.at(-1);
    if (
      currentNode === undefined ||
      currentNode.kind === 'EVENT' ||
      failedRecord?.nodeId !== currentNode.nodeId
    ) {
      throw new Error('Saved failed outcome is not attached to the current encounter.');
    }
  }
  // A retried failure legitimately leaves earlier FAILED records behind: the
  // run stayed alive and re-attempted the same node. Only a FAILED that is not
  // followed by another attempt at the same node means the run should have
  // ended there.
  const abandonedFailure = state.outcomeHistory.findIndex(
    (record, index) =>
      record.outcome === 'FAILED' &&
      index < state.outcomeHistory.length - 1 &&
      state.outcomeHistory[index + 1]?.nodeId !== record.nodeId,
  );
  if (abandonedFailure >= 0) {
    throw new Error('Saved run continues past a failed encounter it never retried.');
  }
  const retriesTaken = state.outcomeHistory.filter(
    (record) => record.outcome === 'FAILED',
  ).length;
  if (state.retryCount < (failedAtCurrentNode ? retriesTaken - 1 : retriesTaken)) {
    throw new Error('Saved retry count is lower than the failures it recorded.');
  }
  // Terminal is only forced by a failure the run cannot retry. A retryable
  // failure is a live run parked at the same node, so it stays non-terminal.
  const retriesExhausted = state.retryCount >= (catalog.retryLimit ?? DEFAULT_RETRY_LIMIT);
  const expectedTerminal =
    state.nodeIndex === strip.length || (failedAtCurrentNode && retriesExhausted);
  if (state.terminal !== expectedTerminal) {
    throw new Error('Saved terminal state is inconsistent with run progress.');
  }

  const processedNodeCount = state.nodeIndex + (failedAtCurrentNode ? 1 : 0);
  const expectedEncounterNodeIds = strip
    .slice(0, processedNodeCount)
    .filter((node) => node.kind !== 'EVENT')
    .map((node) => node.nodeId);
  // A retried node legitimately appears more than once in a row. Collapsing
  // those repeats is what lets the history still be compared against the strip,
  // and every attempt before the last one must be the failure that caused it.
  const collapseAttempts = (
    records: readonly Readonly<{ nodeId: string; outcome: string }>[],
  ): readonly string[] => {
    const collapsed: string[] = [];
    records.forEach((record, index) => {
      const previous = records[index - 1];
      if (previous?.nodeId === record.nodeId) {
        if (previous.outcome !== 'FAILED') {
          throw new Error('Saved run replayed a node it had already resolved.');
        }
        return;
      }
      collapsed.push(record.nodeId);
    });
    return collapsed;
  };
  const outcomeNodeIds = collapseAttempts(state.outcomeHistory);
  const gradeNodeIds = collapseAttempts(state.gradeHistory);
  if (
    !sameOrderedValues(outcomeNodeIds, expectedEncounterNodeIds) ||
    !sameOrderedValues(gradeNodeIds, expectedEncounterNodeIds)
  ) {
    throw new Error('Saved encounter history does not match canonical run progress.');
  }
  if (state.gradeHistory.some((grade, index) => {
    const outcome = state.outcomeHistory[index];
    return outcome === undefined ||
      grade.nodeId !== outcome.nodeId ||
      grade.outcome !== outcome.outcome;
  })) {
    throw new Error('Saved grade and outcome histories disagree.');
  }

  if (state.pendingRewardIds.length > 0) {
    const previousNode = strip[state.nodeIndex - 1];
    const latestOutcome = state.outcomeHistory.at(-1)?.outcome;
    if (
      previousNode === undefined ||
      previousNode.kind === 'EVENT' ||
      (latestOutcome !== 'BEST_RESOLUTION' &&
        latestOutcome !== 'PARTIAL_RESOLUTION')
    ) {
      throw new Error('Saved pending rewards are not attached to an eligible encounter.');
    }
  }

  assertKnownIds('draw pile', state.deck.drawPile, catalog.cardIds);
  assertKnownIds('hand', state.deck.hand, catalog.cardIds);
  assertKnownIds('discard pile', state.deck.discardPile, catalog.cardIds);
  assertKnownIds('exhaust pile', state.deck.exhaustPile, catalog.cardIds);
  assertKnownIds('pending rewards', state.pendingRewardIds, catalog.rewardIds);
  assertKnownIds('claimed rewards', state.claimedRewardIds, catalog.rewardIds);
  assertKnownIds('relics', state.acquiredRelicIds, catalog.relicIds);
  assertKnownIds('enhancements', state.acquiredEnhancementIds, catalog.enhancementIds);
  assertKnownIds('evidence', state.acquiredEvidenceIds, catalog.evidenceIds);
  assertKnownIds('flags', Object.keys(state.flags), catalog.flagIds);
  assertKnownIds('card tuning', Object.keys(state.cardTuning), catalog.cardIds);
  // A grade override for evidence the run never acquired would resurface as a
  // phantom pouch entry the moment an encounter reads the override map.
  assertKnownIds(
    'evidence grades',
    Object.keys(state.evidenceGradeById),
    state.acquiredEvidenceIds,
  );
  if (!Number.isInteger(state.retryCount) || state.retryCount < 0) {
    throw new Error('Saved retry count must be a non-negative integer.');
  }
}

/**
 * Validates the save envelope that produced a restored run state. SaveSchema
 * intentionally continues to accept pre-run v1 documents for import/migration,
 * but the run-layer bootstrap cannot safely resume their encounter-local deck
 * and resources at strip node zero. It therefore accepts only explicit,
 * encounter-free run boundaries whose case metadata matches the current node.
 */
export function assertRestoredRunSaveSemantics(
  save: SaveData,
  state: RunState,
  catalog: RestoredRunSaveCatalog,
): void {
  if (save.encounter !== null) {
    throw new Error('Saved run boundary contains an active encounter snapshot.');
  }
  if (save.run === undefined) {
    throw new Error('Legacy v1 save has no resumable run boundary.');
  }

  assertRestoredRunStateSemantics(state, catalog);
  if (save.run.node_index !== state.nodeIndex) {
    throw new Error('Saved run boundary does not match the restored node position.');
  }

  const boundaryIndex = Math.min(state.nodeIndex, catalog.strip.length - 1);
  const boundaryNode = catalog.strip[boundaryIndex];
  if (boundaryNode === undefined) {
    throw new Error('Saved run boundary has no canonical node metadata.');
  }
  const expectedCaseId = catalog.caseIdsByDirectory[boundaryNode.caseDirectory];
  const expectedContentVersion =
    catalog.contentVersionsByDirectory[boundaryNode.caseDirectory];
  if (expectedCaseId === undefined || expectedContentVersion === undefined) {
    throw new Error(
      `Missing save metadata for case directory ${boundaryNode.caseDirectory}.`,
    );
  }
  if (save.case_id !== expectedCaseId) {
    throw new Error(
      `Saved case ${save.case_id} does not match run boundary ${expectedCaseId}.`,
    );
  }
  if (save.content_version !== expectedContentVersion) {
    throw new Error(
      `Saved content version ${save.content_version} does not match ` +
        `${expectedContentVersion} for ${expectedCaseId}.`,
    );
  }
}

/** Projects only run-owned state; encounter snapshots intentionally remain null. */
export function toRunSaveData(
  state: RunState,
  metadata: RunSaveMetadata,
): SaveData {
  return {
    save_version: CURRENT_SAVE_VERSION,
    case_id: metadata.caseId,
    content_version: metadata.contentVersion,
    run_seed: state.runSeed,
    claims: [],
    evidence: [],
    deck: {
      draw_pile: [...state.deck.drawPile],
      hand: [...state.deck.hand],
      discard_pile: [...state.deck.discardPile],
      exhaust_pile: [...state.deck.exhaustPile],
      locked_cards: {},
    },
    flags: { ...state.flags },
    resources: {
      cp: 0,
      stress: state.stress,
      dp: state.dp,
      composure: 0,
      coercion: 0,
      trust: state.trust,
      turn: 0,
    },
    encounter: null,
    used_routes: [],
    acquired_relics: [...state.acquiredRelicIds],
    acquired_enhancements: [...state.acquiredEnhancementIds],
    run: {
      node_index: state.nodeIndex,
      reward_seed_stream: state.rewardSeedStream,
      false_confessions: state.falseConfessions,
      completed_node_ids: [...state.completedNodeIds],
      pending_reward_ids: [...state.pendingRewardIds],
      claimed_reward_ids: [...state.claimedRewardIds],
      acquired_evidence_ids: [...state.acquiredEvidenceIds],
      card_tuning: Object.fromEntries(
        Object.entries(state.cardTuning).map(([cardId, tuning]) => [
          cardId,
          {
            cp_delta: tuning.cpDelta,
            composure_damage_delta: tuning.composureDamageDelta,
            coercion_delta: tuning.coercionDelta,
          },
        ]),
      ),
      canvassed_topic_ids: [...state.canvassedTopicIds],
      evidence_grade_by_id: { ...state.evidenceGradeById },
      open_route_ids: [...state.openRouteIds],
      retry_count: state.retryCount,
      active_episode_id: state.activeEpisodeId,
      unlocked_episode_ids: [...state.unlockedEpisodeIds],
      completed_episode_ids: [...state.completedEpisodeIds],
      route_node_ids: [...metadata.routeNodeIds],
      grade_history: state.gradeHistory.map((record) => ({
        node_id: record.nodeId,
        outcome: record.outcome,
        grade: record.grade,
      })),
      outcome_history: state.outcomeHistory.map((record) => ({
        node_id: record.nodeId,
        outcome: record.outcome,
      })),
      terminal: state.terminal,
    },
  };
}

/**
 * Bounds are derived from balance.json rather than persisted, so a rebalanced
 * ceiling applies to a save in flight instead of being frozen at write time.
 */
export function restoreRunState(
  save: SaveData,
  resourceBounds: RunResourceBounds = {},
  /**
   * Resolved route. Supplying it lets a pre-episode (v2) save recover its
   * episode bookkeeping instead of restoring with the migration placeholder.
   */
  strip: readonly NodeDefinition[] = [],
): RunState {
  const initial = createRunState({
    resourceBounds,
    runSeed: save.run_seed,
    stress: save.resources.stress,
    dp: save.resources.dp,
    trust: save.resources.trust,
    deck: {
      drawPile: save.deck.draw_pile,
      hand: save.deck.hand,
      discardPile: save.deck.discard_pile,
      exhaustPile: save.deck.exhaust_pile,
    },
    flags: save.flags,
    acquiredRelicIds: save.acquired_relics,
    acquiredEnhancementIds: save.acquired_enhancements,
    ...(save.run === undefined
      ? {}
      : { acquiredEvidenceIds: save.run.acquired_evidence_ids }),
  });
  if (save.run === undefined) return initial;
  return {
    ...initial,
    nodeIndex: save.run.node_index,
    rewardSeedStream: save.run.reward_seed_stream,
    falseConfessions: save.run.false_confessions,
    completedNodeIds: [...save.run.completed_node_ids],
    pendingRewardIds: [...save.run.pending_reward_ids],
    claimedRewardIds: [...save.run.claimed_reward_ids],
    acquiredEvidenceIds: [...save.run.acquired_evidence_ids],
    cardTuning: Object.fromEntries(
      Object.entries(save.run.card_tuning).map(([cardId, tuning]) => [
        cardId,
        {
          cpDelta: tuning.cp_delta,
          composureDamageDelta: tuning.composure_damage_delta,
          coercionDelta: tuning.coercion_delta,
        },
      ]),
    ),
    canvassedTopicIds: [...save.run.canvassed_topic_ids],
    evidenceGradeById: { ...save.run.evidence_grade_by_id },
    openRouteIds: [...save.run.open_route_ids],
    retryCount: save.run.retry_count,
    ...(save.run.active_episode_id === LEGACY_EPISODE_PLACEHOLDER && strip.length > 0
      ? deriveEpisodeProgress(strip, save.run.node_index, save.run.completed_node_ids)
      : {
          activeEpisodeId: save.run.active_episode_id,
          unlockedEpisodeIds: [...save.run.unlocked_episode_ids],
          completedEpisodeIds: [...save.run.completed_episode_ids],
        }),
    gradeHistory: save.run.grade_history.map((record) => ({
      nodeId: record.node_id,
      outcome: record.outcome,
      grade: record.grade,
    })),
    outcomeHistory: save.run.outcome_history.map((record) => ({
      nodeId: record.node_id,
      outcome: record.outcome,
    })),
    terminal: save.run.terminal,
  };
}

export function saveRunAtNodeBoundary(
  repository: SaveRepository,
  state: RunState,
  metadata: RunSaveMetadata,
): SaveData {
  return repository.save(toRunSaveData(state, metadata));
}
