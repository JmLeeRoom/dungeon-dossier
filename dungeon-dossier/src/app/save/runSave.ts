import type { SaveData } from '../../content-io';
import { createRunState, type RunState } from '../../engine/run';
import type { SaveRepository } from './SaveRepository';

export interface RunSaveMetadata {
  readonly caseId: string;
  readonly contentVersion: string;
}

/** Projects only run-owned state; encounter snapshots intentionally remain null. */
export function toRunSaveData(
  state: RunState,
  metadata: RunSaveMetadata,
): SaveData {
  return {
    save_version: 1,
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

export function restoreRunState(save: SaveData): RunState {
  const initial = createRunState({
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
