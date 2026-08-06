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
import { createRunState, type RunState } from '../../src/engine/run';
import {
  UnsupportedSaveVersionError,
  type SaveData,
} from '../../src/content-io/schemas';

const SEMANTIC_CATALOG = {
  strip: [
    {
      nodeId: 'run-node-1',
      kind: 'ENCOUNTER',
      ref: 'encounter-1',
      caseDirectory: 'case-a',
    },
    {
      nodeId: 'run-node-2',
      kind: 'EVENT',
      ref: 'event-1',
      caseDirectory: 'case-a',
    },
    {
      nodeId: 'run-node-3',
      kind: 'BOSS',
      ref: 'encounter-2',
      caseDirectory: 'case-a',
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
    save_version: 1,
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
    });
    expect(saved.encounter).toBeNull();
    expect(saved.run?.node_index).toBe(2);
    expect(restoreRunState(repository.load()!)).toEqual(state);
  });

  it('accepts canonical progress and a failed current encounter', () => {
    expect(() =>
      assertRestoredRunStateSemantics(semanticRunState(), SEMANTIC_CATALOG),
    ).not.toThrow();

    const beforeBoss = semanticRunState();
    const failedAtBoss: RunState = {
      ...beforeBoss,
      nodeIndex: 2,
      completedNodeIds: ['run-node-1', 'run-node-2'],
      pendingRewardIds: [],
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

  it('accepts an encounter-free run save whose metadata matches its boundary', () => {
    const state = semanticRunState();
    const save = toRunSaveData(state, {
      caseId: 'case_a',
      contentVersion: '1.0',
    });

    expect(() =>
      assertRestoredRunSaveSemantics(save, restoreRunState(save), SEMANTIC_CATALOG),
    ).not.toThrow();
  });

  it('keeps legacy v1 import compatibility but rejects it at the run bootstrap boundary', () => {
    const legacy = importSaveJson(JSON.stringify(validSave()));

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
      exportSaveJson({ ...validSave(), save_version: 2 }),
    ).toThrow(UnsupportedSaveVersionError);
  });
});
