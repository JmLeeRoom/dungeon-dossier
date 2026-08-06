import { describe, expect, it } from 'vitest';

import {
  collectAutoplaySceneStrings,
  isAutoplayRequested,
  MAX_AUTOPLAY_SEED,
  parseAutoplaySeedParameter,
  scaledDirectionDelayMs,
} from '../../src/app/autoplayPort';

describe('autoplay scene display-string collection', () => {
  it('collects visible fields, excludes callback IDs, and tolerates cycles', () => {
    const model: {
      title: string;
      nodes: readonly { nodeId?: string; label: string; status: string }[];
      rewardId: string;
      cycle?: unknown;
    } = {
      rewardId: 'reward_dp_small',
      title: '수사 진행 기록',
      nodes: [
        { label: '물컹이 심문', status: 'CURRENT' },
        { label: 'event.raw.title', status: 'LOCKED' },
      ],
    };
    model.cycle = model;

    expect(collectAutoplaySceneStrings(model)).toEqual([
      '수사 진행 기록',
      '물컹이 심문',
      'event.raw.title',
    ]);
    expect(collectAutoplaySceneStrings({
      rewardId: 'reward_dp_small',
      title: 'reward_dp_small',
    })).toEqual(['reward_dp_small']);
  });
});

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

describe('autoplay seed query parsing', () => {
  it.each([
    ['0', 0],
    ['1', 1],
    ['20260805', 20_260_805],
    [' 42 ', 42],
    [MAX_AUTOPLAY_SEED.toString(), MAX_AUTOPLAY_SEED],
  ] as const)('accepts uint32 decimal boundary %j', (parameter, expected) => {
    expect(parseAutoplaySeedParameter(parameter)).toBe(expected);
  });

  it.each([
    null,
    '',
    '   ',
    '-1',
    '1.5',
    '+1',
    '1e3',
    '0x10',
    'NaN',
    'Infinity',
    (MAX_AUTOPLAY_SEED + 1).toString(),
    Number.MAX_SAFE_INTEGER.toString(),
  ])('rejects non-uint32 seed %j without coercion', (parameter) => {
    expect(parseAutoplaySeedParameter(parameter)).toBeUndefined();
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
