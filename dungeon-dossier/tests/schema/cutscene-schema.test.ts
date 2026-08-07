import { describe, expect, it } from 'vitest';

import {
  CUTSCENE_TREATMENTS,
  CutsceneBeatSchema,
  CutsceneSchema,
  EventCutscenesSchema,
} from '../../src/engine/domain/schemas/cutscene';

const minimalBeat = {
  beat_id: 'beat-open',
  text_key: 'cutscene.open.text',
} as const;

function cutscene(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cutscene_id: 'cutscene-intro',
    beats: [{ ...minimalBeat }],
    ...overrides,
  };
}

describe('CutsceneSchema', () => {
  it('fills every authoring default from a minimal beat', () => {
    const parsed = CutsceneBeatSchema.parse({ ...minimalBeat });

    expect(parsed).toStrictEqual({
      beat_id: 'beat-open',
      text_key: 'cutscene.open.text',
      portraits: [],
      treatment: 'NONE',
      duration_ms: 2_400,
      choices: [],
    });
  });

  it('defaults the cutscene envelope to a skippable BEFORE sequence', () => {
    const parsed = CutsceneSchema.parse(cutscene());

    expect(parsed.timing).toBe('BEFORE');
    expect(parsed.skippable).toBe(true);
    expect(EventCutscenesSchema.parse(undefined)).toStrictEqual([]);
  });

  it('round-trips a fully authored branching cutscene', () => {
    const authored = {
      cutscene_id: 'cutscene-alley',
      timing: 'AFTER',
      skippable: false,
      beats: [
        {
          beat_id: 'beat-alley',
          background_asset_key: 'cutscene/alley',
          portraits: [
            { side: 'LEFT', asset_key: 'portrait/detective', dim: false },
            { side: 'RIGHT', asset_key: 'portrait/broker', dim: true },
          ],
          speaker_name_key: 'cutscene.alley.speaker',
          text_key: 'cutscene.alley.text',
          treatment: 'SLOW_FADE',
          audio_cue: 'rain_loop',
          duration_ms: 3_200,
          choices: [
            {
              choice_id: 'choice-press',
              label_key: 'cutscene.alley.press',
              goto_beat_id: 'beat-alley',
              sets_flags: { 'F-12': true },
              gains: [{ type: 'SET_FLAG', target: 'F-12', value: true }],
            },
            {
              choice_id: 'choice-wait',
              label_key: 'cutscene.alley.wait',
              sets_flags: {},
              gains: [],
            },
          ],
          default_choice_id: 'choice-wait',
        },
      ],
    } as const;

    const parsed = CutsceneSchema.parse(authored);

    expect(parsed).toStrictEqual(authored);
    expect(CutsceneSchema.parse(parsed)).toStrictEqual(parsed);
  });

  it('exposes the six presentation treatments the renderer mirrors', () => {
    expect([...CUTSCENE_TREATMENTS].sort()).toStrictEqual([
      'FADE_IN',
      'FADE_OUT',
      'FLASH',
      'NONE',
      'SHAKE',
      'SLOW_FADE',
    ]);
  });

  it('enforces the authored bounds on beats, portraits, choices and duration', () => {
    expect(CutsceneSchema.safeParse(cutscene({ beats: [] })).success).toBe(false);
    expect(
      CutsceneSchema.safeParse(
        cutscene({
          beats: Array.from({ length: 65 }, (_unused, index) => ({
            ...minimalBeat,
            beat_id: `beat-${String(index)}`,
          })),
        }),
      ).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({
        ...minimalBeat,
        portraits: [
          { side: 'LEFT', asset_key: 'a' },
          { side: 'RIGHT', asset_key: 'b' },
          { side: 'LEFT', asset_key: 'c' },
        ],
      }).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({
        ...minimalBeat,
        choices: Array.from({ length: 5 }, (_unused, index) => ({
          choice_id: `choice-${String(index)}`,
          label_key: 'cutscene.choice',
        })),
      }).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({ ...minimalBeat, duration_ms: 0 }).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({ ...minimalBeat, duration_ms: 20_001 }).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({ ...minimalBeat, duration_ms: 1_200.5 }).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({ ...minimalBeat, background_asset_key: '   ' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys and unknown treatments', () => {
    expect(
      CutsceneBeatSchema.safeParse({ ...minimalBeat, camera: 'PAN' }).success,
    ).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({ ...minimalBeat, treatment: 'ZOOM' }).success,
    ).toBe(false);
    expect(CutsceneSchema.safeParse(cutscene({ loops: true })).success).toBe(false);
    expect(
      CutsceneBeatSchema.safeParse({
        ...minimalBeat,
        portraits: [{ side: 'CENTER', asset_key: 'a' }],
      }).success,
    ).toBe(false);
  });

  it('allows at most two cutscenes with distinct ids and timings per host node', () => {
    const before = cutscene({ cutscene_id: 'cutscene-before', timing: 'BEFORE' });
    const after = cutscene({ cutscene_id: 'cutscene-after', timing: 'AFTER' });

    expect(EventCutscenesSchema.parse([before, after])).toHaveLength(2);
    expect(EventCutscenesSchema.safeParse([before, before]).success).toBe(false);
    expect(
      EventCutscenesSchema.safeParse([
        before,
        cutscene({ cutscene_id: 'cutscene-other', timing: 'BEFORE' }),
      ]).success,
    ).toBe(false);
    expect(
      EventCutscenesSchema.safeParse([before, after, cutscene()]).success,
    ).toBe(false);
  });
});
