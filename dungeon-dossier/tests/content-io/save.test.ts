import { describe, expect, it, vi } from 'vitest';
import {
  assertRestoredRunSaveSemantics,
  assertRestoredRunStateSemantics,
  SaveRepository,
  exportSaveJson,
  importSaveJson,
  restoreRunState,
  saveRunAtNodeBoundary,
  toRunSaveData,
} from '../../src/app/save';
import {
  createRunState,
  DEFAULT_RETRY_LIMIT,
  type NodeDefinition,
  type RunState,
} from '../../src/engine/run';
import {
  CURRENT_SAVE_VERSION,
  LEGACY_EPISODE_PLACEHOLDER,
  UnsupportedSaveVersionError,
  type SaveData,
} from '../../src/content-io/schemas';

/** One episode: the COMBAT/EVENT/BOSS stage triple every episode resolves to. */
const SEMANTIC_CATALOG = {
  strip: [
    {
      nodeId: 'run-node-1',
      kind: 'ENCOUNTER',
      ref: 'encounter-1',
      caseDirectory: 'case-a',
      episodeId: 'episode-a',
      episodeIndex: 0,
      slotRole: 'COMBAT',
      slotIndex: 0,
    },
    {
      nodeId: 'run-node-2',
      kind: 'EVENT',
      ref: 'event-1',
      caseDirectory: 'case-a',
      episodeId: 'episode-a',
      episodeIndex: 0,
      slotRole: 'EVENT',
      slotIndex: 1,
    },
    {
      nodeId: 'run-node-3',
      kind: 'BOSS',
      ref: 'encounter-2',
      caseDirectory: 'case-a',
      episodeId: 'episode-a',
      episodeIndex: 0,
      slotRole: 'BOSS',
      slotIndex: 2,
    },
  ] as const,
  cardIds: ['card-known'],
  rewardIds: ['reward-known'],
  relicIds: ['relic-known'],
  enhancementIds: ['enhancement-known'],
  evidenceIds: ['evidence-known'],
  flagIds: ['F-01'],
  caseIdsByDirectory: { 'case-a': 'case_a' },
  contentVersionsByDirectory: { 'case-a': '1.0' },
} as const;

const SEMANTIC_ROUTE_NODE_IDS = SEMANTIC_CATALOG.strip.map((node) => node.nodeId);

/** The shipped canonical route: 3 episodes x 3 slots, every slot's candidate[0]. */
const CANONICAL_ROUTE_NODE_IDS = [
  'run_tutorial_01',
  'run_tutorial_02',
  'run_tutorial_05',
  'run_ep001_01',
  'run_ep001_02',
  'run_ep001_05',
  'run_ep004_01',
  'run_ep004_02',
  'run_ep004_05',
] as const;

function semanticRunState(): RunState {
  const initial = createRunState({
    runSeed: 91,
    stress: 100,
    dp: 5,
    trust: 0,
    deck: {
      drawPile: ['card-known'],
      hand: [],
      discardPile: [],
      exhaustPile: [],
    },
    flags: { 'F-01': false },
    acquiredRelicIds: ['relic-known'],
    acquiredEnhancementIds: ['enhancement-known'],
    acquiredEvidenceIds: ['evidence-known'],
    episodeIds: ['episode-a'],
  });
  return {
    ...initial,
    nodeIndex: 1,
    completedNodeIds: ['run-node-1'],
    pendingRewardIds: ['reward-known'],
    gradeHistory: [{
      nodeId: 'run-node-1',
      outcome: 'BEST_RESOLUTION',
      grade: 'A',
    }],
    outcomeHistory: [{
      nodeId: 'run-node-1',
      outcome: 'BEST_RESOLUTION',
    }],
  };
}

function validSave(): SaveData {
  return {
    save_version: CURRENT_SAVE_VERSION,
    case_id: 'case_tutorial',
    content_version: '1.0',
    run_seed: 481_516,
    claims: [
      {
        claim_id: 'clm_tutorial_who',
        commitment: 'ASSERTED',
        epistemic: 'UNKNOWN',
        presentation: 'NORMAL',
        resistance: 0,
        exposed: true,
      },
    ],
    evidence: [],
    deck: {
      draw_pile: ['card_query_who'],
      hand: [],
      discard_pile: [],
      exhaust_pile: [],
      locked_cards: {},
    },
    flags: {},
    resources: {
      cp: 3,
      stress: 100,
      dp: 0,
      composure: 60,
      coercion: 0,
      trust: 0,
      turn: 0,
    },
    encounter: null,
    used_routes: [],
    acquired_relics: [],
    acquired_enhancements: [],
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('save schema usage path', () => {
  it('round-trips current saves through the migration entrypoint', () => {
    const save = validSave();
    expect(importSaveJson(exportSaveJson(save))).toEqual(save);
  });

  it('persists schema-validated runtime state', () => {
    const storage = memoryStorage();
    const repository = new SaveRepository(storage, 'test-save');
    const save = validSave();

    expect(repository.save(save)).toEqual(save);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(repository.load()).toEqual(save);
    repository.clear();
    expect(repository.load()).toBeUndefined();
  });

  it('restores the previous serialized save when a storage write throws', () => {
    const values = new Map<string, string>();
    let throwAfterNextWrite = false;
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
        if (throwAfterNextWrite) {
          throwAfterNextWrite = false;
          throw new Error('simulated post-write failure');
        }
      },
      removeItem: (key) => values.delete(key),
    }, 'atomic-save');
    const previous = validSave();
    const next: SaveData = {
      ...previous,
      resources: { ...previous.resources, dp: 25 },
    };
    repository.save(previous);

    throwAfterNextWrite = true;
    expect(() => repository.save(next)).toThrow('simulated post-write failure');
    expect(repository.load()).toEqual(previous);

    expect(() => repository.save(next)).not.toThrow();
    expect(repository.load()).toEqual(next);
  });

  it('auto-saves and restores run-owned state only at a node boundary', () => {
    const storage = memoryStorage();
    const repository = new SaveRepository(storage, 'run-save');
    const initial = createRunState({
      runSeed: 77,
      stress: 82,
      dp: 20,
      trust: 2,
      deck: {
        drawPile: ['card_query_who'],
        hand: [],
        discardPile: ['card_confirm_basic'],
        exhaustPile: [],
      },
      flags: { 'F-02': true },
      episodeIds: ['tutorial', 'ep001', 'ep004'],
    });
    const state: RunState = {
      ...initial,
      nodeIndex: 2,
      completedNodeIds: ['run_tutorial_01', 'run_tutorial_02'],
      claimedRewardIds: ['reward_dp_small'],
      gradeHistory: [{
        nodeId: 'run_tutorial_01',
        outcome: 'BEST_RESOLUTION',
        grade: 'A',
      }],
      outcomeHistory: [{
        nodeId: 'run_tutorial_01',
        outcome: 'BEST_RESOLUTION',
      }],
    };

    const saved = saveRunAtNodeBoundary(repository, state, {
      caseId: 'case_tutorial',
      contentVersion: '1.1',
      routeNodeIds: CANONICAL_ROUTE_NODE_IDS,
    });
    expect(saved.encounter).toBeNull();
    expect(saved.run?.node_index).toBe(2);
    // The resolved route is persisted, not re-derived, so a later candidate-pool
    // edit cannot relocate this in-flight save.
    expect(saved.run?.route_node_ids).toEqual([...CANONICAL_ROUTE_NODE_IDS]);
    expect(saved.run?.active_episode_id).toBe('tutorial');
    expect(saved.run?.unlocked_episode_ids).toEqual(['tutorial']);
    expect(saved.run?.completed_episode_ids).toEqual([]);
    expect(restoreRunState(repository.load()!)).toEqual(state);
  });

  it('accepts canonical progress and a retry-exhausted failed current encounter', () => {
    expect(() =>
      assertRestoredRunStateSemantics(semanticRunState(), SEMANTIC_CATALOG),
    ).not.toThrow();

    const beforeBoss = semanticRunState();
    const failedAtBoss: RunState = {
      ...beforeBoss,
      nodeIndex: 2,
      completedNodeIds: ['run-node-1', 'run-node-2'],
      pendingRewardIds: [],
      retryCount: DEFAULT_RETRY_LIMIT,
      terminal: true,
      gradeHistory: [
        ...beforeBoss.gradeHistory,
        { nodeId: 'run-node-3', outcome: 'FAILED', grade: 'F' },
      ],
      outcomeHistory: [
        ...beforeBoss.outcomeHistory,
        { nodeId: 'run-node-3', outcome: 'FAILED' },
      ],
    };
    expect(() =>
      assertRestoredRunStateSemantics(failedAtBoss, SEMANTIC_CATALOG),
    ).not.toThrow();
  });

  it('accepts a retryable failure parked non-terminally at the current encounter', () => {
    const beforeBoss = semanticRunState();
    const retryableAtBoss: RunState = {
      ...beforeBoss,
      nodeIndex: 2,
      completedNodeIds: ['run-node-1', 'run-node-2'],
      pendingRewardIds: [],
      retryCount: 1,
      terminal: false,
      gradeHistory: [
        ...beforeBoss.gradeHistory,
        { nodeId: 'run-node-3', outcome: 'FAILED', grade: 'F' },
      ],
      outcomeHistory: [
        ...beforeBoss.outcomeHistory,
        { nodeId: 'run-node-3', outcome: 'FAILED' },
      ],
    };
    expect(() =>
      assertRestoredRunStateSemantics(retryableAtBoss, SEMANTIC_CATALOG),
    ).not.toThrow();
    // The same save is a forgery once it claims the run ended while retries remain.
    expect(() =>
      assertRestoredRunStateSemantics(
        { ...retryableAtBoss, terminal: true },
        SEMANTIC_CATALOG,
      ),
    ).toThrow('terminal state');
  });

  /**
   * The exact history `completeEncounterNode` writes when a RETRY-policy defeat
   * is absorbed and the node is then cleared: two records for one strip node.
   * `assertRestoredRunStateSemantics` already blesses this shape in its
   * abandoned-failure rule, but its encounter-history rule still compares the
   * raw record list against the strip prefix, so the retry record makes the
   * lists differ in length and the save is refused. bootstrap.ts swallows that
   * refusal and silently starts a fresh run, i.e. every retried run loses its
   * save on the next launch. Left asserting the correct behaviour; see the
   * handover notes for the one-place fix in src/app/save/runSave.ts.
   */
  it('accepts a history whose failed node was retried and then cleared', () => {
    const state = semanticRunState();
    const retriedThenCleared: RunState = {
      ...state,
      retryCount: 1,
      gradeHistory: [
        { nodeId: 'run-node-1', outcome: 'FAILED', grade: 'F' },
        ...state.gradeHistory,
      ],
      outcomeHistory: [
        { nodeId: 'run-node-1', outcome: 'FAILED' },
        ...state.outcomeHistory,
      ],
    };
    expect(() =>
      assertRestoredRunStateSemantics(retriedThenCleared, SEMANTIC_CATALOG),
    ).not.toThrow();
    // The retry it spent has to be accounted for; a resolved failure with no
    // retry behind it is a forged extra life.
    expect(() =>
      assertRestoredRunStateSemantics(
        { ...retriedThenCleared, retryCount: 0 },
        SEMANTIC_CATALOG,
      ),
    ).toThrow('retry count is lower');
    // A FAILED that the next record does not re-attempt still ends the run.
    expect(() =>
      assertRestoredRunStateSemantics(
        {
          ...retriedThenCleared,
          gradeHistory: [
            { nodeId: 'run-node-3', outcome: 'FAILED', grade: 'F' },
            ...state.gradeHistory,
          ],
          outcomeHistory: [
            { nodeId: 'run-node-3', outcome: 'FAILED' },
            ...state.outcomeHistory,
          ],
        },
        SEMANTIC_CATALOG,
      ),
    ).toThrow('never retried');
  });

  it('accepts an encounter-free run save whose metadata matches its boundary', () => {
    const state = semanticRunState();
    const save = toRunSaveData(state, {
      caseId: 'case_a',
      contentVersion: '1.0',
      routeNodeIds: SEMANTIC_ROUTE_NODE_IDS,
    });

    expect(() =>
      assertRestoredRunSaveSemantics(save, restoreRunState(save), SEMANTIC_CATALOG),
    ).not.toThrow();
  });

  it('re-derives episode bookkeeping for a migrated pre-episode run boundary', () => {
    const twoEpisodeStrip: readonly NodeDefinition[] = [
      ...SEMANTIC_CATALOG.strip,
      {
        nodeId: 'run-node-4',
        kind: 'ENCOUNTER',
        ref: 'encounter-3',
        caseDirectory: 'case-b',
        episodeId: 'episode-b',
        episodeIndex: 1,
        slotRole: 'COMBAT',
        slotIndex: 0,
      },
      {
        nodeId: 'run-node-5',
        kind: 'EVENT',
        ref: 'event-2',
        caseDirectory: 'case-b',
        episodeId: 'episode-b',
        episodeIndex: 1,
        slotRole: 'EVENT',
        slotIndex: 1,
      },
      {
        nodeId: 'run-node-6',
        kind: 'BOSS',
        ref: 'encounter-4',
        caseDirectory: 'case-b',
        episodeId: 'episode-b',
        episodeIndex: 1,
        slotRole: 'BOSS',
        slotIndex: 2,
      },
    ];
    const migrated: SaveData = {
      ...validSave(),
      run: {
        node_index: 4,
        reward_seed_stream: 12,
        false_confessions: 0,
        completed_node_ids: ['run-node-1', 'run-node-2', 'run-node-3', 'run-node-4'],
        pending_reward_ids: [],
        claimed_reward_ids: [],
        acquired_evidence_ids: [],
        grade_history: [],
        outcome_history: [],
        card_tuning: {},
        canvassed_topic_ids: [],
        evidence_grade_by_id: {},
        open_route_ids: [],
        retry_count: 0,
        // Exactly what migrateSave writes for a v2 document: a placeholder plus
        // empty arrays the run layer is expected to replace from the route.
        active_episode_id: LEGACY_EPISODE_PLACEHOLDER,
        unlocked_episode_ids: [],
        completed_episode_ids: [],
        route_node_ids: [],
        terminal: false,
      },
    };

    const restored = restoreRunState(migrated, {}, twoEpisodeStrip);
    expect(restored.activeEpisodeId).toBe('episode-b');
    expect(restored.unlockedEpisodeIds).toEqual(['episode-a', 'episode-b']);
    expect(restored.completedEpisodeIds).toEqual(['episode-a']);

    // Without the route there is nothing to re-derive from, so the placeholder
    // must survive rather than be guessed at.
    const withoutStrip = restoreRunState(migrated);
    expect(withoutStrip.activeEpisodeId).toBe(LEGACY_EPISODE_PLACEHOLDER);
    expect(withoutStrip.unlockedEpisodeIds).toEqual([]);
    expect(withoutStrip.completedEpisodeIds).toEqual([]);
  });

  it('keeps legacy v1 import compatibility but rejects it at the run bootstrap boundary', () => {
    const legacy = importSaveJson(
      JSON.stringify({ ...validSave(), save_version: 1 }),
    );

    expect(legacy.save_version).toBe(CURRENT_SAVE_VERSION);
    expect(legacy.run).toBeUndefined();
    expect(() =>
      assertRestoredRunSaveSemantics(
        legacy,
        restoreRunState(legacy),
        SEMANTIC_CATALOG,
      ),
    ).toThrow('no resumable run boundary');
  });

  it('rejects an active encounter snapshot instead of restoring it as strip node zero', () => {
    const midEncounter = importSaveJson(JSON.stringify({
      ...validSave(),
      encounter: {
        encounter_id: 'enc_tutorial_slime',
        flow_node_id: 'flow_intro',
        round_index: 2,
        entered_flow_nodes: ['flow_intro'],
        active_modifiers: [],
        completed_objectives: [],
        shield_durability: {},
      },
    }));

    expect(() =>
      assertRestoredRunSaveSemantics(
        midEncounter,
        restoreRunState(midEncounter),
        SEMANTIC_CATALOG,
      ),
    ).toThrow('active encounter snapshot');
  });

  it('rejects case and content-version metadata from another run boundary', () => {
    const state = semanticRunState();
    const save = toRunSaveData(state, {
      caseId: 'case_a',
      contentVersion: '1.0',
      routeNodeIds: SEMANTIC_ROUTE_NODE_IDS,
    });

    expect(() =>
      assertRestoredRunSaveSemantics(
        { ...save, case_id: 'case_other' },
        state,
        SEMANTIC_CATALOG,
      ),
    ).toThrow('does not match run boundary');
    expect(() =>
      assertRestoredRunSaveSemantics(
        { ...save, content_version: '9.0' },
        state,
        SEMANTIC_CATALOG,
      ),
    ).toThrow('does not match 1.0');
  });

  it('rejects a noncanonical completed prefix, forged terminal state, and history', () => {
    const state = semanticRunState();
    expect(() => assertRestoredRunStateSemantics({
      ...state,
      completedNodeIds: ['run-node-2'],
    }, SEMANTIC_CATALOG)).toThrow('canonical strip prefix');

    expect(() => assertRestoredRunStateSemantics({
      ...state,
      terminal: true,
    }, SEMANTIC_CATALOG)).toThrow('terminal state');

    expect(() => assertRestoredRunStateSemantics({
      ...state,
      gradeHistory: [{
        nodeId: 'run-node-2',
        outcome: 'BEST_RESOLUTION',
        grade: 'A',
      }],
    }, SEMANTIC_CATALOG)).toThrow('encounter history');
  });

  it.each([
    ['card', (state: RunState): RunState => ({
      ...state,
      deck: { ...state.deck, drawPile: ['card-unknown'] },
    })],
    ['pending reward', (state: RunState): RunState => ({
      ...state,
      pendingRewardIds: ['reward-unknown'],
    })],
    ['claimed reward', (state: RunState): RunState => ({
      ...state,
      claimedRewardIds: ['reward-unknown'],
    })],
    ['relic', (state: RunState): RunState => ({
      ...state,
      acquiredRelicIds: ['relic-unknown'],
    })],
    ['enhancement', (state: RunState): RunState => ({
      ...state,
      acquiredEnhancementIds: ['enhancement-unknown'],
    })],
    ['evidence', (state: RunState): RunState => ({
      ...state,
      acquiredEvidenceIds: ['evidence-unknown'],
    })],
    ['flag', (state: RunState): RunState => ({
      ...state,
      flags: { ...state.flags, 'F-99': true },
    })],
  ] as const)('rejects an unknown %s catalogue reference', (_label, corrupt) => {
    expect(() =>
      assertRestoredRunStateSemantics(corrupt(semanticRunState()), SEMANTIC_CATALOG),
    ).toThrow(/unknown ID/u);
  });

  it('rejects definition fields instead of persisting them', () => {
    const save = structuredClone(validSave()) as unknown as Record<string, unknown>;
    const claims = save.claims as Record<string, unknown>[];
    if (!claims[0]) throw new Error('Fixture must have one claim state.');
    claims[0].canonical_meaning = 'Private definition text';
    claims[0].truth = { relation: 'CONSISTENT_WITH_WORLD' };

    expect(() => exportSaveJson(save)).toThrow();
  });

  it('rejects unsupported future save versions', () => {
    expect(() =>
      exportSaveJson({ ...validSave(), save_version: CURRENT_SAVE_VERSION + 1 }),
    ).toThrow(UnsupportedSaveVersionError);
  });
});
