import { describe, expect, it } from 'vitest';

import {
  CINEMATIC_LEAD_MS,
  MODE_CONFIGS,
  resolveNonBestCheckOutcomeAction,
  usesAutoplayActionCadence,
  videoNodeGateMs,
} from '../../src/dev/autoplay/driver';
import { AUTOPLAY_CURSOR_DOCK_START_MS } from '../../src/dev/autoplay/hud';
import { VIDEO_DURATION_ACCEPTANCE } from '../../src/dev/autoplay/report';
import {
  resolveTypewriterIntervalMs,
  setTypewriterIntervalOverride,
} from '../../src/ui/widgets/typewriter';

const NODE_COUNT = 15;
const VIDEO_TARGET_SEC = 150;

describe('cinematic video autoplay mode', () => {
  it('configures the 2m30s recording pace exactly as specified', () => {
    const video = MODE_CONFIGS.video;
    expect(video.timeScale).toBe(1.15);
    expect(video.actionDelayMs).toBe(950);
    expect(video.sceneStallMs).toBe(90_000);
    expect(video.runTimeoutMs).toBe(360_000);
    expect(video.skipTypewriter).toBe(false);
    expect(video.targetDurationSec).toBe(VIDEO_TARGET_SEC);
    expect(video.typewriterIntervalMs).toBeGreaterThanOrEqual(18);
    expect(video.typewriterIntervalMs).toBeLessThanOrEqual(22);
    expect(video.targetDurationSec! * 1000).toBe(
      VIDEO_DURATION_ACCEPTANCE.targetDurationMs,
    );
  });

  it('declares the measurable wall-clock report gate without claiming a browser run', () => {
    expect(VIDEO_DURATION_ACCEPTANCE).toEqual({
      targetDurationMs: 150_000,
      minimumDurationMs: 135_000,
      maximumDurationMs: 165_000,
      measurement: 'L2_WALL_CLOCK',
    });
    // This is contract math only. A real 1280x800 L2 browser report remains
    // required evidence that the driver actually lands inside this interval.
  });

  it('can release the video typewriter override for subsequent same-tab scenes', () => {
    setTypewriterIntervalOverride(MODE_CONFIGS.video.typewriterIntervalMs);
    expect(resolveTypewriterIntervalMs()).toBe(20);

    // finish()/fail() invokes the same reset so a later ordinary run returns
    // to the normal 32ms cadence instead of inheriting video mode forever.
    setTypewriterIntervalOverride(undefined);
    expect(resolveTypewriterIntervalMs()).toBe(32);
  });

  it('gives the completion cushion priority over the pacing target', () => {
    // The hard timeout is only a last-resort guard. It does not prove the 150s
    // target; the finished L2 report applies the separate wall-clock range.
    expect(MODE_CONFIGS.video.runTimeoutMs).toBeGreaterThanOrEqual(
      VIDEO_TARGET_SEC * 1000 * 2,
    );
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

  it('keeps the visible lead inside the action cadence instead of compounding it', () => {
    expect(CINEMATIC_LEAD_MS).toBeGreaterThan(0);
    expect(CINEMATIC_LEAD_MS).toBeLessThanOrEqual(16);
    expect(AUTOPLAY_CURSOR_DOCK_START_MS).toBeLessThan(CINEMATIC_LEAD_MS);
    expect(CINEMATIC_LEAD_MS).toBeLessThan(MODE_CONFIGS.video.actionDelayMs);
  });

  it('abbreviates mechanical transitions only in measured video mode', () => {
    expect(usesAutoplayActionCadence({ kind: 'STRIP' }, 'video')).toBe(false);
    expect(usesAutoplayActionCadence({ kind: 'EVENT_RESULT' }, 'video')).toBe(false);
    expect(usesAutoplayActionCadence({ kind: 'ENDING' }, 'video')).toBe(false);
    expect(usesAutoplayActionCadence({
      kind: 'INTERROGATION',
      machineState: 'CHECK_OUTCOME',
      secureStatementEnabled: false,
    }, 'video')).toBe(false);
    expect(usesAutoplayActionCadence({
      kind: 'INTERROGATION',
      machineState: 'BUILD_ARGUMENT',
      secureStatementEnabled: false,
    }, 'video')).toBe(true);
    expect(usesAutoplayActionCadence({
      kind: 'INTERROGATION',
      machineState: 'CHECK_OUTCOME',
      secureStatementEnabled: true,
    }, 'video')).toBe(true);
    expect(usesAutoplayActionCadence({ kind: 'EVENT' }, 'video')).toBe(true);
    expect(usesAutoplayActionCadence({ kind: 'REWARD' }, 'video')).toBe(true);
    for (const mode of ['watch', 'turbo', 'record'] as const) {
      expect(usesAutoplayActionCadence({ kind: 'STRIP' }, mode)).toBe(true);
      expect(usesAutoplayActionCadence({ kind: 'EVENT_RESULT' }, mode)).toBe(true);
    }
  });

  it('advances non-BEST CHECK_OUTCOME scenes instead of resubmitting', () => {
    expect(resolveNonBestCheckOutcomeAction('best', false, false)).toBeUndefined();
    expect(resolveNonBestCheckOutcomeAction('partial', false, true)).toBe('END_TURN');
    expect(resolveNonBestCheckOutcomeAction('coerced', true, false)).toBe('END_TURN');
    expect(resolveNonBestCheckOutcomeAction('fuzz', true, true)).toBe('SECURE');
    expect(resolveNonBestCheckOutcomeAction('greedy', true, true)).toBe('SECURE');
  });
});
