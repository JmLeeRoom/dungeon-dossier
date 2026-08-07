import { describe, expect, it } from 'vitest';

import {
  DEAD_SCENE_RETRY_ACTION,
  DEAD_SCENE_RETURN_ACTION,
  DEAD_SCENE_TABLE,
  FAILURE_REASONS,
  isFailureReason,
  toDeadSceneModel,
  type FailureReason,
} from '../../src/app/deadScene';
import { clearStrings, installStrings } from '../../src/app/i18n';
import { DEFAULT_RETRY_LIMIT } from '../../src/engine/run';
import { deadSceneTreatmentDurationMs } from '../../src/ui/screens/ending';

function state(overrides: { retryCount?: number } = {}): Parameters<
  typeof toDeadSceneModel
>[0]['state'] {
  return {
    nodeIndex: 4,
    acquiredEvidenceIds: ['ev-a', 'ev-b'],
    completedNodeIds: ['n1', 'n2', 'n3', 'n4'],
    stress: 0,
    retryCount: overrides.retryCount ?? 0,
  };
}

describe('dead scene presentation table', () => {
  it('maps every failure reason exactly once', () => {
    expect(Object.keys(DEAD_SCENE_TABLE).sort()).toEqual([...FAILURE_REASONS].sort());
    for (const reason of FAILURE_REASONS) {
      const preset = DEAD_SCENE_TABLE[reason];
      // Registry keys are category/name/state, so a two-segment key silently
      // resolves to the missing-asset placeholder instead of the art.
      expect(preset.illustrationAssetKey.split('/')).toHaveLength(3);
      expect(preset.audioCue.startsWith('sting_')).toBe(true);
      expect(deadSceneTreatmentDurationMs(preset.treatment)).toBeGreaterThan(0);
    }
  });

  it('narrows OutcomeReason to the four failure reasons', () => {
    expect(isFailureReason('STRESS_DEPLETED')).toBe(true);
    // A win reason must never route to a defeat screen.
    expect(isFailureReason('BEST_CONFIRMED')).toBe(false);
    expect(isFailureReason('COMPOSURE_DEPLETED')).toBe(false);
    expect(isFailureReason('NONE')).toBe(false);
  });
});

describe('dead scene model', () => {
  it('always offers a decision and never auto-advances', () => {
    const model = toDeadSceneModel({
      reason: 'STRESS_DEPLETED',
      state: state(),
      totalNodes: 15,
      coercion: 12,
      retryLimit: DEFAULT_RETRY_LIMIT,
    });
    expect(model.actions.map((action) => action.actionId)).toEqual([
      DEAD_SCENE_RETRY_ACTION,
      DEAD_SCENE_RETURN_ACTION,
    ]);
    expect(model.actions.every((action) => action.label !== '')).toBe(true);
    expect(model.stats.length).toBeGreaterThan(0);
  });

  it('disables retry with a stated reason once the budget is spent', () => {
    const spent = toDeadSceneModel({
      reason: 'COERCION_LIMIT_EXCEEDED',
      state: state({ retryCount: DEFAULT_RETRY_LIMIT }),
      totalNodes: 15,
      coercion: 40,
      retryLimit: DEFAULT_RETRY_LIMIT,
    });
    const retry = spent.actions.find((action) => action.actionId === DEAD_SCENE_RETRY_ACTION);
    expect(retry?.enabled).toBe(false);
    expect(retry?.disabledReason).toBeDefined();
    // Returning to the strip must stay available or the run would be stuck.
    const back = spent.actions.find((action) => action.actionId === DEAD_SCENE_RETURN_ACTION);
    expect(back?.enabled).toBe(true);
  });

  it('renders localized copy when a string table is installed', () => {
    installStrings({
      'dead.turn.title': '구속 시한 만료',
      'dead.turn.cause': '시계가 먼저 답을 내렸다.',
    });
    try {
      const model = toDeadSceneModel({
        reason: 'TURN_LIMIT_EXCEEDED',
        state: state(),
        totalNodes: 15,
        coercion: 0,
        retryLimit: DEFAULT_RETRY_LIMIT,
      });
      expect(model.title).toBe('구속 시한 만료');
      expect(model.cause).toBe('시계가 먼저 답을 내렸다.');
    } finally {
      clearStrings();
    }
  });

  it('reports the remaining retry budget for each reason', () => {
    for (const reason of FAILURE_REASONS satisfies readonly FailureReason[]) {
      const model = toDeadSceneModel({
        reason,
        state: state({ retryCount: 1 }),
        totalNodes: 15,
        coercion: 3,
        retryLimit: DEFAULT_RETRY_LIMIT,
      });
      expect(model.stats.some((stat) => stat.value.includes('1'))).toBe(true);
    }
  });
});
