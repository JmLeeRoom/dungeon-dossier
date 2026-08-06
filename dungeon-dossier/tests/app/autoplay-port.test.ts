import { describe, expect, it } from 'vitest';

import {
  isAutoplayRequested,
  scaledDirectionDelayMs,
} from '../../src/app/autoplayPort';

describe('autoplay query parsing', () => {
  it.each(['true', '1', 'turbo', ''])('starts L2 for present value %j', (value) => {
    expect(isAutoplayRequested(value, true)).toBe(true);
  });

  it.each(['false', 'FALSE', '0', ' 0 '])('honors explicit opt-out value %j', (value) => {
    expect(isAutoplayRequested(value, true)).toBe(false);
  });

  it('never starts outside development or without the parameter', () => {
    expect(isAutoplayRequested(null, true)).toBe(false);
    expect(isAutoplayRequested('true', false)).toBe(false);
  });
});

describe('autoplay direction timing', () => {
  it('caps a 1.2 second direction at 60ms in turbo mode', () => {
    expect(scaledDirectionDelayMs(1_200, 0, 20)).toBe(60);
    expect(scaledDirectionDelayMs(1_200, 600, 20)).toBe(30);
    expect(scaledDirectionDelayMs(1_200, 1_200, 20)).toBe(0);
  });

  it('preserves realtime watch playback and rejects invalid scales', () => {
    expect(scaledDirectionDelayMs(1_200, 0, 1)).toBe(1_200);
    expect(() => scaledDirectionDelayMs(1_200, 0, 0)).toThrow(/time scale/u);
    expect(() => scaledDirectionDelayMs(1_200, 0, Number.NaN)).toThrow(
      /time scale/u,
    );
  });
});
