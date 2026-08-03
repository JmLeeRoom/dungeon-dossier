import { describe, expect, it, vi } from 'vitest';
import {
  SaveRepository,
  exportSaveJson,
  importSaveJson,
  restoreRunState,
  saveRunAtNodeBoundary,
} from '../../src/app/save';
import { createRunState, type RunState } from '../../src/engine/run';
import {
  UnsupportedSaveVersionError,
  type SaveData,
} from '../../src/content-io/schemas';

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
