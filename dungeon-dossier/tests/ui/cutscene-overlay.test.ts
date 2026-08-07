import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer() as Container & {
        anchor: Readonly<{ set(x: number, y?: number): void }>;
        text: string;
      };
      Object.defineProperties(view, {
        anchor: { value: { set: () => undefined } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import {
  createCutsceneOverlay,
  presentationTreatmentFrame,
  PRESENTATION_TREATMENTS,
  PRESENTATION_TREATMENT_TABLE,
  type CutsceneBeatView,
  type CutsceneOverlayOptions,
} from '../../src/ui/screens/cutscene';

const BEAT_MS = 100;
/** Long enough for the typewriter to emit every fixture character in one tick. */
const SETTLE_MS = 400;

function beat(
  beatId: string,
  overrides: Partial<CutsceneBeatView> = {},
): CutsceneBeatView {
  return {
    beatId,
    portraits: [],
    text: '진술',
    treatment: 'NONE',
    durationMs: BEAT_MS,
    choices: [],
    ...overrides,
  };
}

const forkBeat = beat('beat-fork', {
  text: '어느 쪽으로?',
  choices: [
    { choiceId: 'choice-press', label: '압박한다' },
    { choiceId: 'choice-wait', label: '기다린다' },
  ],
  defaultChoiceId: 'choice-wait',
});

/** Branching fixture: 0 intro -> 1 fork -> 2 press path | 3 wait path. */
const branchingBeats: readonly CutsceneBeatView[] = [
  beat('beat-intro'),
  forkBeat,
  beat('beat-press'),
  beat('beat-wait'),
];

function branchResolver(beatId: string, choiceId?: string): number | null {
  if (choiceId === 'choice-press') return 2;
  if (choiceId === 'choice-wait') return 3;
  if (beatId === 'beat-intro') return 1;
  return null;
}

function overlayFor(
  beats: readonly CutsceneBeatView[],
  options: Partial<CutsceneOverlayOptions> = {},
): ReturnType<typeof createCutsceneOverlay> {
  return createCutsceneOverlay(beats, {
    assets: { resolveUrl: () => undefined },
    skippable: false,
    ...options,
  });
}

describe('createCutsceneOverlay', () => {
  it('satisfies the timed-overlay contract before any beat completes', () => {
    const overlay = overlayFor([beat('beat-a'), beat('beat-b')]);

    expect(overlay.view).toBeInstanceOf(Container);
    expect(overlay.durationMs).toBe(BEAT_MS * 2);
    expect(overlay.elapsedMs).toBe(0);
    expect(overlay.complete).toBe(false);
    expect(overlay.beatIndex).toBe(0);
    expect(overlay.playbackState).toBe('RUNNING');
    expect(overlay.beatPhase).toBe('TYPING');
    expect(() => overlay.update(-1)).toThrow(RangeError);

    overlay.view.destroy({ children: true });
  });

  it('auto-advances beats in order and completes only after the last one', () => {
    const overlay = overlayFor([beat('beat-a'), beat('beat-b'), beat('beat-c')]);

    overlay.update(BEAT_MS);
    expect(overlay.beatIndex).toBe(1);
    expect(overlay.complete).toBe(false);

    overlay.update(BEAT_MS);
    expect(overlay.beatIndex).toBe(2);
    expect(overlay.complete).toBe(false);
    expect(overlay.playbackState).toBe('RUNNING');

    overlay.update(BEAT_MS);
    expect(overlay.beatIndex).toBe(2);
    expect(overlay.playbackState).toBe('COMPLETE');
    expect(overlay.complete).toBe(true);
    expect(overlay.elapsedMs).toBe(BEAT_MS * 3);

    const settled = overlay.interactionRevision;
    overlay.update(BEAT_MS);
    expect(overlay.elapsedMs).toBe(BEAT_MS * 3);
    expect(overlay.interactionRevision).toBe(settled);

    overlay.view.destroy({ children: true });
  });

  it('does not auto-advance a beat while the typewriter is still typing', () => {
    const overlay = overlayFor([
      beat('beat-long', { text: '아주 긴 진술을 천천히 받아 적는다', durationMs: 1 }),
      beat('beat-next'),
    ]);

    overlay.update(16);
    expect(overlay.beatPhase).toBe('TYPING');
    expect(overlay.beatIndex).toBe(0);

    overlay.update(16);
    expect(overlay.beatIndex).toBe(0);

    overlay.view.destroy({ children: true });
  });

  it('fast-forwards the typewriter on the first advance and moves on with the second', () => {
    const overlay = overlayFor([
      beat('beat-long', { text: '아주 긴 진술을 천천히 받아 적는다', durationMs: 9_999 }),
      beat('beat-next'),
    ]);

    overlay.update(16);
    const typing = overlay.interactionRevision;

    overlay.advance();
    expect(overlay.beatPhase).toBe('READY');
    expect(overlay.beatIndex).toBe(0);
    expect(overlay.interactionRevision).toBeGreaterThan(typing);

    overlay.advance();
    expect(overlay.beatIndex).toBe(1);
    expect(overlay.beatPhase).toBe('TYPING');

    overlay.view.destroy({ children: true });
  });

  it('stops the timer on a choice beat until a choice arrives', () => {
    const onChoice = vi.fn();
    const overlay = overlayFor(branchingBeats, {
      onChoice,
      resolveNext: branchResolver,
    });

    overlay.update(BEAT_MS);
    expect(overlay.beatIndex).toBe(1);

    overlay.update(SETTLE_MS);
    expect(overlay.beatPhase).toBe('WAITING_CHOICE');
    expect(overlay.playbackState).toBe('WAITING_INPUT');

    const frozenElapsed = overlay.elapsedMs;
    const frozenRevision = overlay.interactionRevision;
    overlay.update(10_000);
    overlay.advance();

    expect(overlay.beatIndex).toBe(1);
    expect(overlay.elapsedMs).toBe(frozenElapsed);
    expect(overlay.interactionRevision).toBe(frozenRevision);
    expect(overlay.complete).toBe(false);
    expect(onChoice).not.toHaveBeenCalled();

    overlay.choose('choice-press');
    expect(onChoice).toHaveBeenCalledExactlyOnceWith('beat-fork', 'choice-press');
    expect(overlay.beatIndex).toBe(2);
    expect(overlay.playbackState).toBe('RUNNING');

    overlay.view.destroy({ children: true });
  });

  it('follows resolveNext branches and rejects choices the beat does not own', () => {
    const overlay = overlayFor(branchingBeats, { resolveNext: branchResolver });

    overlay.update(BEAT_MS);
    overlay.update(SETTLE_MS);
    expect(() => {
      overlay.choose('choice-flee');
    }).toThrow(RangeError);
    expect(overlay.beatIndex).toBe(1);

    overlay.choose('choice-wait');
    expect(overlay.beatIndex).toBe(3);

    overlay.update(BEAT_MS);
    expect(overlay.complete).toBe(true);

    overlay.view.destroy({ children: true });
  });

  it('falls through to the next beat in order when no resolver is supplied', () => {
    const overlay = overlayFor([beat('beat-a'), forkBeat, beat('beat-c')], {
      onChoice: vi.fn(),
    });

    overlay.update(BEAT_MS);
    overlay.update(SETTLE_MS);
    overlay.choose('choice-press');

    expect(overlay.beatIndex).toBe(2);

    overlay.view.destroy({ children: true });
  });

  it('ignores skip on a cutscene content marked unskippable', () => {
    const onSkipChoices = vi.fn();
    const overlay = overlayFor(branchingBeats, {
      onSkipChoices,
      resolveNext: branchResolver,
      skippable: false,
    });

    overlay.skip();

    expect(onSkipChoices).not.toHaveBeenCalled();
    expect(overlay.playbackState).toBe('RUNNING');
    expect(overlay.complete).toBe(false);

    overlay.view.destroy({ children: true });
  });

  it('stages every remaining default branch exactly once when skipping', () => {
    const onSkipChoices = vi.fn();
    const onChoice = vi.fn();
    const overlay = overlayFor(branchingBeats, {
      onChoice,
      onSkipChoices,
      resolveNext: branchResolver,
      skippable: true,
    });

    overlay.skip();

    expect(onChoice).not.toHaveBeenCalled();
    expect(onSkipChoices).toHaveBeenCalledExactlyOnceWith([
      { beatId: 'beat-fork', choiceId: 'choice-wait' },
    ]);
    expect(overlay.complete).toBe(true);
    expect(overlay.playbackState).toBe('COMPLETE');

    overlay.skip();
    expect(onSkipChoices).toHaveBeenCalledOnce();

    overlay.view.destroy({ children: true });
  });

  it('refuses a skippable cutscene whose choice beat has no default branch', () => {
    const defaultless = beat('beat-fork', { choices: forkBeat.choices });

    expect(() =>
      createCutsceneOverlay([beat('beat-a'), defaultless], { skippable: true }),
    ).toThrow(RangeError);
    expect(() => createCutsceneOverlay([], { skippable: false })).toThrow(RangeError);
  });

  it('renders portraits and backgrounds as placeholders when assets are missing', () => {
    const resolveUrl = vi.fn(() => undefined);
    const resolveOptionalUrl = vi.fn(() => undefined);
    const play = vi.fn();
    const overlay = overlayFor(
      [
        beat('beat-duo', {
          backgroundAssetKey: 'cutscene/alley',
          speakerName: '형사',
          audioCue: 'rain_loop',
          portraits: [
            { side: 'LEFT', assetKey: 'portrait/detective', dim: false },
            { side: 'RIGHT', assetKey: 'portrait/broker', dim: true },
          ],
        }),
      ],
      { assets: { resolveUrl, resolveOptionalUrl }, audio: { play, mute: vi.fn() } },
    );

    expect(() => overlay.onEnter?.()).not.toThrow();
    expect(() => overlay.update(BEAT_MS)).not.toThrow();
    expect(resolveOptionalUrl).toHaveBeenCalledWith('portrait/broker');
    // Exact lookup first, registry fallback second: neither one may crash the beat.
    expect(resolveUrl).toHaveBeenCalledWith('portrait/broker');
    expect(play).toHaveBeenCalledExactlyOnceWith('rain_loop');
    expect(overlay.complete).toBe(true);

    overlay.view.destroy({ children: true });
  });

  it('cancels rather than completes when the layer is destroyed mid-playback', () => {
    const overlay = overlayFor([beat('beat-a'), beat('beat-b')]);

    overlay.onDestroy?.();

    expect(overlay.playbackState).toBe('CANCELLED');
    expect(overlay.complete).toBe(false);

    overlay.view.destroy({ children: true });
  });

  it('drives every treatment from the data table instead of renderer branches', () => {
    expect(Object.keys(PRESENTATION_TREATMENT_TABLE).sort()).toStrictEqual(
      [...PRESENTATION_TREATMENTS].sort(),
    );
    expect(presentationTreatmentFrame('NONE', 0)).toStrictEqual({
      alpha: 1,
      offsetX: 0,
      flashAlpha: 0,
    });
    expect(presentationTreatmentFrame('FADE_IN', 0).alpha).toBe(0);
    expect(presentationTreatmentFrame('FADE_IN', 240).alpha).toBe(1);
    expect(presentationTreatmentFrame('FADE_OUT', 240).alpha).toBe(0);
    expect(presentationTreatmentFrame('SLOW_FADE', 240).alpha).toBeCloseTo(240 / 900);
    expect(presentationTreatmentFrame('SLOW_FADE', 900).alpha).toBe(1);
    expect(presentationTreatmentFrame('FLASH', 0).flashAlpha).toBeCloseTo(0.85);
    expect(presentationTreatmentFrame('FLASH', 180).flashAlpha).toBe(0);
    expect(presentationTreatmentFrame('SHAKE', 400).offsetX).toBe(0);
    expect(Math.abs(presentationTreatmentFrame('SHAKE', 40).offsetX)).toBeLessThanOrEqual(3);

    const shakeOffsets = [40, 120, 200, 280, 360].map(
      (elapsedMs) => presentationTreatmentFrame('SHAKE', elapsedMs).offsetX,
    );
    expect(shakeOffsets.some((offset) => offset !== 0)).toBe(true);
    expect(shakeOffsets.every((offset) => Number.isInteger(offset))).toBe(true);

    const overlay = overlayFor([beat('beat-flash', { treatment: 'FLASH' })]);
    expect(() => overlay.update(90)).not.toThrow();
    overlay.view.destroy({ children: true });
  });
});
