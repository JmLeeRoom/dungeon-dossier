import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  FlagsSchema,
  GradesSchema,
  RewardsSchema,
  RunStripSchema,
} from '../../src/engine/domain';
import {
  completeEncounterNode,
  createNodeStrip,
  createRunState,
  DEFAULT_RETRY_LIMIT,
  DEFAULT_RETRY_STRESS_RESTORE,
  type CompleteEncounterNodeInput,
  type RunState,
} from '../../src/engine/run';

function common(file: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../content/common/${file}`, import.meta.url), 'utf8'),
  ) as unknown;
}

const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
const flags = FlagsSchema.parse(common('flags.json'));
const rewards = RewardsSchema.parse(common('rewards.json'));
const grades = GradesSchema.parse(common('grades.json'));

function baseState(overrides: Partial<RunState> = {}): RunState {
  return {
    ...createRunState({
      runSeed: 7,
      stress: 0,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    }),
    ...overrides,
  };
}

function failInput(
  overrides: Partial<CompleteEncounterNodeInput> = {},
): CompleteEncounterNodeInput {
  return {
    strip,
    outcome: 'FAILED',
    flagDefinitions: flags.flags,
    rewardCatalogue: rewards,
    rewardRarity: 'COMMON',
    episodeId: 'case_tutorial',
    act: 0,
    gradeCatalogue: grades,
    gradeMetrics: {
      requiredClaimResolutionRatio: 0,
      optionalObjectiveRatio: 0,
      sweetSpotFinish: false,
      originalsPreserved: false,
      coercion: 0,
    },
    ...overrides,
  };
}

describe('encounter failure policy', () => {
  it('terminates the run by default, preserving the old behaviour', () => {
    const completion = completeEncounterNode(baseState(), failInput());
    expect(completion.retryAllowed).toBe(false);
    expect(completion.state.terminal).toBe(true);
    expect(completion.state.retryCount).toBe(0);
  });

  it('keeps the run alive at the same node while retries remain', () => {
    const before = baseState();
    const completion = completeEncounterNode(before, failInput({ failurePolicy: 'RETRY' }));

    expect(completion.retryAllowed).toBe(true);
    expect(completion.state.terminal).toBe(false);
    expect(completion.state.nodeIndex).toBe(before.nodeIndex);
    expect(completion.state.retryCount).toBe(1);
    // The node is not cleared, so the strip must not record it as completed.
    expect(completion.state.completedNodeIds).toEqual(before.completedNodeIds);
    // The failure is still on the record even though the run continues.
    expect(completion.state.outcomeHistory.at(-1)?.outcome).toBe('FAILED');
  });

  it('restores enough stress that the next attempt is winnable', () => {
    const completion = completeEncounterNode(
      baseState({ stress: 0 }),
      failInput({ failurePolicy: 'RETRY' }),
    );
    expect(completion.state.stress).toBe(DEFAULT_RETRY_STRESS_RESTORE);
  });

  it('never lowers stress a retry did not need to top up', () => {
    const completion = completeEncounterNode(
      baseState({ stress: DEFAULT_RETRY_STRESS_RESTORE + 25 }),
      failInput({ failurePolicy: 'RETRY' }),
    );
    expect(completion.state.stress).toBe(DEFAULT_RETRY_STRESS_RESTORE + 25);
  });

  it('falls back to termination once the retry budget is spent', () => {
    const completion = completeEncounterNode(
      baseState({ retryCount: DEFAULT_RETRY_LIMIT }),
      failInput({ failurePolicy: 'RETRY' }),
    );
    expect(completion.retryAllowed).toBe(false);
    expect(completion.state.terminal).toBe(true);
    expect(completion.state.retryCount).toBe(DEFAULT_RETRY_LIMIT);
  });

  it('honours an explicitly narrowed retry limit', () => {
    const completion = completeEncounterNode(
      baseState({ retryCount: 1 }),
      failInput({ failurePolicy: 'RETRY', retryLimit: 1 }),
    );
    expect(completion.retryAllowed).toBe(false);
    expect(completion.state.terminal).toBe(true);
  });

  it('does not touch retry state on a successful encounter', () => {
    const completion = completeEncounterNode(
      baseState(),
      failInput({ outcome: 'BEST_RESOLUTION', failurePolicy: 'RETRY' }),
    );
    expect(completion.retryAllowed).toBe(false);
    expect(completion.state.retryCount).toBe(0);
    expect(completion.state.nodeIndex).toBe(1);
  });
});
