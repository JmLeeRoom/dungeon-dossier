import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AutoplayReportModule from '../../src/dev/autoplay/report';

vi.mock('../../src/dev/autoplay/hud', () => ({
  createAutoplayHud: () => ({
    update: vi.fn(),
    showAction: vi.fn(),
  }),
}));

vi.mock('../../src/dev/autoplay/report', async (importOriginal) => {
  const actual = await importOriginal<typeof AutoplayReportModule>();
  return { ...actual, publishReport: vi.fn() };
});

import type { AutoplayPort } from '../../src/app/autoplayPort';
import { startAutoplay } from '../../src/dev/autoplay/driver';
import { AUTOPLAY_NODE_COUNT } from '../../src/dev/autoplay/report';
import {
  resolveTypewriterIntervalMs,
  setTypewriterIntervalOverride,
} from '../../src/ui/widgets/typewriter';

function terminalPort(flowError?: string): {
  readonly port: AutoplayPort;
  readonly setDirectionTimeScale: ReturnType<typeof vi.fn>;
} {
  const setDirectionTimeScale = vi.fn();
  return {
    setDirectionTimeScale,
    port: {
      scene: () => ({
        kind: 'ENDING',
        endingId: 'ending-true',
        restart: vi.fn(),
      }),
      runSnapshot: () => ({
        // Terminal index of the resolved episode route.
        nodeIndex: AUTOPLAY_NODE_COUNT,
        flags: { 'F-01': false, 'F-12': true, 'F-13': true },
        dp: 0,
        stress: 0,
        trust: 0,
        claimedRewardIds: [],
        pendingRewardIds: [],
        acquiredRelicIds: [],
        completedNodeIds: [],
        gradeHistory: [],
        outcomeHistory: [],
        terminal: true,
      }),
      lastFlowError: () => flowError,
      setDirectionTimeScale,
      onSceneChange: () => vi.fn(),
    },
  };
}

describe('autoplay lifecycle cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    setTypewriterIntervalOverride(undefined);
  });

  afterEach(() => {
    setTypewriterIntervalOverride(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ['terminal completion', undefined],
    ['flow-error failure', 'injected flow error'],
  ] as const)('releases the video interval after %s', async (_label, flowError) => {
    const { port, setDirectionTimeScale } = terminalPort(flowError);
    startAutoplay(port, {
      mode: 'video',
      policy: 'best',
      seed: 20_260_805,
    });
    expect(resolveTypewriterIntervalMs()).toBe(20);

    await vi.advanceTimersByTimeAsync(flowError === undefined ? 1_200 : 1);

    expect(resolveTypewriterIntervalMs()).toBe(32);
    expect(setDirectionTimeScale.mock.calls).toEqual([[1.15], [1]]);
  });
});
