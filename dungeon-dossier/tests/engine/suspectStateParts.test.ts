import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UPSET_COMPOSURE_RATIO,
  SUSPECT_STATE_PARTS,
  deriveSuspectStatePart,
  evaluateSuspectState,
  isSuspectStatePart,
  suspectComposureRatio,
  upsetThreshold,
} from '../../src/engine/suspectState';

describe('suspect state parts', () => {
  it('names exactly the three authored 512x512 sheets', () => {
    expect(SUSPECT_STATE_PARTS).toEqual(['base', 'upset', 'lose']);
    expect(isSuspectStatePart('upset')).toBe(true);
    expect(isSuspectStatePart('parts')).toBe(false);
    expect(DEFAULT_UPSET_COMPOSURE_RATIO).toBe(0.4);
  });

  it('normalizes the composure ratio against a possibly missing maximum', () => {
    expect(suspectComposureRatio(50, 100)).toBe(0.5);
    expect(suspectComposureRatio(120, 100)).toBe(1);
    expect(suspectComposureRatio(-5, 100)).toBe(0);
    expect(suspectComposureRatio(50, 0)).toBe(0);
    expect(suspectComposureRatio(Number.NaN, 100)).toBe(0);
    expect(upsetThreshold({ composure: 0, composureMax: 1 })).toBe(DEFAULT_UPSET_COMPOSURE_RATIO);
    expect(upsetThreshold({ composure: 0, composureMax: 1, upsetRatio: 5 })).toBe(1);
  });

  it('walks base to upset as composure crosses the threshold', () => {
    expect(deriveSuspectStatePart({ composure: 100, composureMax: 100 })).toBe('base');
    expect(deriveSuspectStatePart({ composure: 41, composureMax: 100 })).toBe('base');
    expect(deriveSuspectStatePart({ composure: 40, composureMax: 100 })).toBe('upset');
    expect(deriveSuspectStatePart({ composure: 1, composureMax: 100 })).toBe('upset');
  });

  it('honours a content-supplied threshold instead of the default', () => {
    expect(
      deriveSuspectStatePart({ composure: 60, composureMax: 100, upsetRatio: 0.7 }),
    ).toBe('upset');
    expect(
      deriveSuspectStatePart({ composure: 60, composureMax: 100, upsetRatio: 0.5 }),
    ).toBe('base');
  });

  it('reaches lose on zero composure or on a confession, and defeat outranks upset', () => {
    expect(deriveSuspectStatePart({ composure: 0, composureMax: 100 })).toBe('lose');
    expect(deriveSuspectStatePart({ composure: -20, composureMax: 100 })).toBe('lose');
    expect(
      deriveSuspectStatePart({ composure: 100, composureMax: 100, confessed: true }),
    ).toBe('lose');
    expect(
      deriveSuspectStatePart({ composure: 10, composureMax: 100, confessed: true }),
    ).toBe('lose');
  });

  it('reports the ratio and defeat flag alongside the chosen sheet', () => {
    expect(evaluateSuspectState({ composure: 30, composureMax: 100 })).toEqual({
      part: 'upset',
      composureRatio: 0.3,
      defeated: false,
    });
    expect(evaluateSuspectState({ composure: 0, composureMax: 100 })).toEqual({
      part: 'lose',
      composureRatio: 0,
      defeated: true,
    });
  });
});
