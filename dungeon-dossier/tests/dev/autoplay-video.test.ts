import { describe, expect, it } from 'vitest';

import {
  CINEMATIC_LEAD_MS,
  MODE_CONFIGS,
  videoNodeGateMs,
} from '../../src/dev/autoplay/driver';

const NODE_COUNT = 15;
const VIDEO_TARGET_SEC = 150;

describe('cinematic video autoplay mode', () => {
  it('configures the 2m30s recording pace exactly as specified', () => {
    const video = MODE_CONFIGS.video;
    expect(video.timeScale).toBe(1);
    expect(video.actionDelayMs).toBe(1_800);
    expect(video.sceneStallMs).toBe(90_000);
    expect(video.runTimeoutMs).toBe(200_000);
    expect(video.skipTypewriter).toBe(false);
    expect(video.targetDurationSec).toBe(VIDEO_TARGET_SEC);
  });

  it('keeps every other mode free of duration pacing', () => {
    expect(MODE_CONFIGS.watch.targetDurationSec).toBeUndefined();
    expect(MODE_CONFIGS.turbo.targetDurationSec).toBeUndefined();
    expect(MODE_CONFIGS.record.targetDurationSec).toBeUndefined();
  });

  it('schedules the 15 nodes across exactly 150 seconds', () => {
    expect(videoNodeGateMs(0, VIDEO_TARGET_SEC)).toBe(0);
    expect(videoNodeGateMs(5, VIDEO_TARGET_SEC)).toBe(50_000);
    expect(videoNodeGateMs(NODE_COUNT, VIDEO_TARGET_SEC)).toBe(150_000);
    for (let index = 0; index < NODE_COUNT; index += 1) {
      const budget =
        videoNodeGateMs(index + 1, VIDEO_TARGET_SEC) -
        videoNodeGateMs(index, VIDEO_TARGET_SEC);
      expect(budget).toBe(10_000);
    }
  });

  it('never gates a run backwards or below zero', () => {
    expect(videoNodeGateMs(-1, VIDEO_TARGET_SEC)).toBe(0);
    expect(videoNodeGateMs(Number.NaN, VIDEO_TARGET_SEC)).toBe(0);
    for (let index = 0; index < NODE_COUNT; index += 1) {
      expect(videoNodeGateMs(index + 1, VIDEO_TARGET_SEC)).toBeGreaterThan(
        videoNodeGateMs(index, VIDEO_TARGET_SEC),
      );
    }
  });

  it('fits at least two cinematic beats inside one node budget', () => {
    const perNodeBudgetMs = (VIDEO_TARGET_SEC * 1000) / NODE_COUNT;
    const beatMs = MODE_CONFIGS.video.actionDelayMs + CINEMATIC_LEAD_MS;
    expect(beatMs * 2).toBeLessThanOrEqual(perNodeBudgetMs);
  });
});
