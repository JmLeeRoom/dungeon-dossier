import { describe, expect, it } from 'vitest';

import {
  collectCutsceneOutcome,
  cutsceneForTiming,
  toCutsceneBeatViews,
} from '../../src/app/cutscenePlayback';
import { clearStrings, installStrings } from '../../src/app/i18n';
import {
  CUTSCENE_TREATMENTS,
  CutsceneSchema,
  NonCombatEventSchema,
} from '../../src/engine/domain';
import { PRESENTATION_TREATMENTS } from '../../src/ui/screens/cutscene';

const cutscene = CutsceneSchema.parse({
  cutscene_id: 'cutscene_intro',
  timing: 'BEFORE',
  skippable: true,
  beats: [
    {
      beat_id: 'beat_open',
      text_key: 'cutscene.intro.open',
      speaker_name_key: 'entity.detective.name',
      treatment: 'FADE_IN',
      duration_ms: 1_200,
      portraits: [{ side: 'LEFT', asset_key: 'portrait/김태훈/base', dim: false }],
    },
    {
      beat_id: 'beat_branch',
      text_key: 'cutscene.intro.branch',
      treatment: 'SHAKE',
      duration_ms: 900,
      choices: [
        {
          choice_id: 'choice_press',
          label_key: 'cutscene.intro.press',
          sets_flags: { 'F-03': true },
          gains: [{ type: 'ADJUST_RESOURCE', resource: 'dp', delta: 4 }],
        },
        {
          choice_id: 'choice_wait',
          label_key: 'cutscene.intro.wait',
          sets_flags: { 'F-03': false },
          gains: [],
        },
      ],
    },
  ],
});

describe('cutscene treatment vocabularies', () => {
  it('keeps the engine and presentation enums in lockstep', () => {
    // The UI cannot import engine schemas, so the two lists are separate and
    // would otherwise drift apart silently.
    expect([...PRESENTATION_TREATMENTS].sort()).toEqual([...CUTSCENE_TREATMENTS].sort());
  });
});

describe('toCutsceneBeatViews', () => {
  it('resolves every localization key before the UI sees it', () => {
    installStrings({
      'cutscene.intro.open': '문이 닫혔다.',
      'cutscene.intro.branch': '그는 대답하지 않았다.',
      'entity.detective.name': '김태훈',
      'cutscene.intro.press': '몰아붙인다',
    });
    try {
      const views = toCutsceneBeatViews(cutscene);
      expect(views[0]?.text).toBe('문이 닫혔다.');
      expect(views[0]?.speakerName).toBe('김태훈');
      expect(views[1]?.choices[0]?.label).toBe('몰아붙인다');
      // No view string may still look like a raw key.
      for (const view of views) {
        expect(view.text).not.toMatch(/^[a-z]+\.[a-z.]+$/u);
      }
    } finally {
      clearStrings();
    }
  });

  it('carries the treatment across and offers skip a default branch', () => {
    const views = toCutsceneBeatViews(cutscene);
    expect(views[0]?.treatment).toBe('FADE_IN');
    expect(views[1]?.treatment).toBe('SHAKE');
    expect(views[1]?.defaultChoiceId).toBe('choice_press');
    expect(views[0]?.defaultChoiceId).toBeUndefined();
  });
});

describe('collectCutsceneOutcome', () => {
  it('collapses the taken branches into one commit payload', () => {
    const outcome = collectCutsceneOutcome(cutscene, [
      { beatId: 'beat_branch', choiceId: 'choice_press' },
    ]);
    expect(outcome.flags).toEqual({ 'F-03': true });
    expect(outcome.gains).toEqual([
      { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 4 },
    ]);
  });

  it('yields nothing when no branch was taken', () => {
    expect(collectCutsceneOutcome(cutscene, [])).toEqual({ flags: {}, gains: [] });
  });

  it('ignores selections that do not match the authored cutscene', () => {
    const outcome = collectCutsceneOutcome(cutscene, [
      { beatId: 'beat_missing', choiceId: 'choice_press' },
      { beatId: 'beat_branch', choiceId: 'choice_unknown' },
    ]);
    expect(outcome).toEqual({ flags: {}, gains: [] });
  });
});

describe('cutsceneForTiming', () => {
  const event = NonCombatEventSchema.parse({
    event_id: 'event_probe',
    node: 'node_probe',
    title_key: 'event.probe.title',
    description_key: 'event.probe.desc',
    pattern: 'A',
    cutscenes: [cutscene, { ...cutscene, cutscene_id: 'cutscene_outro', timing: 'AFTER' }],
    choices: [
      { choice_id: 'choice_a', label_key: 'a', gains: [], sets_flags: {} },
      { choice_id: 'choice_b', label_key: 'b', gains: [], sets_flags: {} },
    ],
  });

  it('selects at most one cutscene per timing', () => {
    expect(cutsceneForTiming(event, 'BEFORE')?.cutscene_id).toBe('cutscene_intro');
    expect(cutsceneForTiming(event, 'AFTER')?.cutscene_id).toBe('cutscene_outro');
  });

  it('returns undefined for an event that frames nothing', () => {
    const bare = NonCombatEventSchema.parse({
      event_id: 'event_bare',
      node: 'node_bare',
      title_key: 'event.bare.title',
      description_key: 'event.bare.desc',
      pattern: 'A',
      choices: [
        { choice_id: 'choice_a', label_key: 'a', gains: [], sets_flags: {} },
        { choice_id: 'choice_b', label_key: 'b', gains: [], sets_flags: {} },
      ],
    });
    expect(bare.cutscenes).toEqual([]);
    expect(cutsceneForTiming(bare, 'BEFORE')).toBeUndefined();
  });
});
