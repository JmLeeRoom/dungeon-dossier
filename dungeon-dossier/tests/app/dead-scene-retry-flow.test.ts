import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DEAD_SCENE_RETRY_ACTION,
  DEAD_SCENE_RETURN_ACTION,
  isFailureReason,
  toDeadSceneModel,
} from '../../src/app/deadScene';
import { createRunSession, type RunSession } from '../../src/app/createRunSession';
import { rewardRarityForOutcome } from '../../src/app/gameRunState';
import { SaveRepository } from '../../src/app/save';
import { restoreRunState } from '../../src/app/save/runSave';
import {
  BalanceSchema,
  FlagsSchema,
  GradesSchema,
  RewardsSchema,
  RunStripSchema,
} from '../../src/engine/domain';
import {
  createNodeStrip,
  createRunState,
  DEFAULT_RETRY_LIMIT,
  runResourceBoundsFromBalance,
} from '../../src/engine/run';

function common(file: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../content/common/${file}`, import.meta.url), 'utf8'),
  ) as unknown;
}

const balance = BalanceSchema.parse(common('balance.json'));
const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
const flags = FlagsSchema.parse(common('flags.json'));
const rewards = RewardsSchema.parse(common('rewards.json'));
const grades = GradesSchema.parse(common('grades.json'));
const bounds = runResourceBoundsFromBalance(balance);

const CASE_IDS = {
  tutorial: 'case_tutorial',
  ep001: 'case_ep001_red_ledger',
  ep004: 'case_ep004_midnight_express',
} as const;

function memoryStore(): { repository: SaveRepository; values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    repository: new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }),
  };
}

function session(repository?: SaveRepository): RunSession {
  return createRunSession({
    initialState: createRunState({
      runSeed: 4_242,
      stress: balance.stress.max,
      dp: 0,
      trust: 0,
      resourceBounds: bounds,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    }),
    strip,
    flags: flags.flags,
    rewards,
    grades,
    caseIdsByDirectory: CASE_IDS,
    ...(repository === undefined ? {} : { saveRepository: repository }),
  });
}

function failFirstNode(run: RunSession) {
  return run.finishEncounter({
    outcome: 'FAILED',
    rewardRarity: rewardRarityForOutcome('FAILED', 0, false),
    episodeId: CASE_IDS.tutorial,
    act: 0,
    failurePolicy: 'RETRY',
    gradeMetrics: {
      requiredClaimResolutionRatio: 0,
      optionalObjectiveRatio: 0,
      sweetSpotFinish: false,
      originalsPreserved: false,
      coercion: 0,
    },
  });
}

describe('dead scene retry keeps the run playable', () => {
  it('holds the node so the player can attempt it again', () => {
    const run = session();
    const before = run.snapshot.nodeIndex;
    const completion = failFirstNode(run);

    expect(completion.retryAllowed).toBe(true);
    expect(run.snapshot.nodeIndex).toBe(before);
    expect(run.snapshot.terminal).toBe(false);
    expect(run.snapshot.retryCount).toBe(1);
    // A failed node is not cleared, so nothing may be appended to the strip log.
    expect(run.snapshot.completedNodeIds).toHaveLength(0);
    // A failure never hands out a reward screen to select from.
    expect(run.snapshot.pendingRewardIds).toEqual([]);
    expect(completion.rewardChoices).toEqual([]);
  });

  it('advances normally once the retried node is finally won', () => {
    const run = session();
    failFirstNode(run);
    const won = run.finishEncounter({
      outcome: 'BEST_RESOLUTION',
      rewardRarity: rewardRarityForOutcome('BEST_RESOLUTION', 0, false),
      episodeId: CASE_IDS.tutorial,
      act: 0,
      failurePolicy: 'RETRY',
      gradeMetrics: {
        requiredClaimResolutionRatio: 1,
        optionalObjectiveRatio: 1,
        sweetSpotFinish: true,
        originalsPreserved: true,
        coercion: 0,
      },
    });

    expect(run.snapshot.nodeIndex).toBe(1);
    expect(run.snapshot.completedNodeIds).toHaveLength(1);
    // The spent retry stays on the record after the node is cleared.
    expect(run.snapshot.retryCount).toBe(1);
    expect(won.rewardChoices.length).toBeGreaterThan(0);
  });

  it('ends the run once the retry budget is gone', () => {
    const run = session();
    for (let attempt = 0; attempt < DEFAULT_RETRY_LIMIT; attempt += 1) {
      expect(failFirstNode(run).retryAllowed).toBe(true);
    }
    const exhausted = failFirstNode(run);

    expect(exhausted.retryAllowed).toBe(false);
    expect(run.snapshot.terminal).toBe(true);
    expect(run.snapshot.retryCount).toBe(DEFAULT_RETRY_LIMIT);
  });

  it('offers retry until the budget is gone, then only the way out', () => {
    const run = session();
    const model = () =>
      toDeadSceneModel({
        reason: 'STRESS_DEPLETED',
        state: run.snapshot,
        totalNodes: strip.length,
        coercion: 0,
        retryLimit: DEFAULT_RETRY_LIMIT,
      });
    const enabled = (actionId: string): boolean =>
      model().actions.find((action) => action.actionId === actionId)?.enabled === true;

    expect(enabled(DEAD_SCENE_RETRY_ACTION)).toBe(true);
    for (let attempt = 0; attempt < DEFAULT_RETRY_LIMIT; attempt += 1) failFirstNode(run);
    expect(enabled(DEAD_SCENE_RETRY_ACTION)).toBe(false);
    // Returning to the strip must always stay open or the screen is a dead end.
    expect(enabled(DEAD_SCENE_RETURN_ACTION)).toBe(true);
  });

  it('persists the retry across a save and reload at the failed node', () => {
    const store = memoryStore();
    const run = session(store.repository);
    failFirstNode(run);

    const saved = store.repository.load();
    if (saved === undefined) throw new Error('the failure boundary must have saved');
    const restored = restoreRunState(saved, bounds);

    expect(restored.retryCount).toBe(run.snapshot.retryCount);
    expect(restored.nodeIndex).toBe(run.snapshot.nodeIndex);
    expect(restored.terminal).toBe(false);
    expect(restored.stress).toBe(run.snapshot.stress);
    expect(restored.resourceBounds).toEqual(bounds);
  });

  it('routes only genuine failure reasons to a defeat screen', () => {
    expect(isFailureReason('STRESS_DEPLETED')).toBe(true);
    expect(isFailureReason('BEST_CONFIRMED')).toBe(false);
  });
});
