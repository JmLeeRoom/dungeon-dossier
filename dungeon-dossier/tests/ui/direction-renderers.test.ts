import { readFileSync } from 'node:fs';

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
  DIRECTION_AUDIO_CUES,
  ENDING_DIRECTION_RENDERERS,
  ENDING_DIRECTION_KEYS,
  JUDGMENT_DIRECTION_RENDERERS,
  JUDGMENT_DIRECTION_KEYS,
  createEndingDirection,
  createJudgmentDirection,
  type DirectionAudioPort,
} from '../../src/ui/screens/interrogation';

function audioSpies(): Readonly<{
  port: DirectionAudioPort;
  play: ReturnType<typeof vi.fn>;
  mute: ReturnType<typeof vi.fn>;
}> {
  const play = vi.fn();
  const mute = vi.fn();
  return { port: { play, mute }, play, mute };
}

describe('key-only direction renderers', () => {
  it('covers exactly five ending and five judgment direction keys', () => {
    expect(Object.keys(ENDING_DIRECTION_RENDERERS).sort()).toEqual(
      [...ENDING_DIRECTION_KEYS].sort(),
    );
    expect(Object.keys(JUDGMENT_DIRECTION_RENDERERS).sort()).toEqual(
      [...JUDGMENT_DIRECTION_KEYS].sort(),
    );
    expect(ENDING_DIRECTION_KEYS).toHaveLength(5);
    expect(JUDGMENT_DIRECTION_KEYS).toHaveLength(5);
  });

  it('renders every treatment without throwing when optional assets are missing', () => {
    const assets = { resolveUrl: vi.fn(() => undefined) };
    const renderers = [
      ...ENDING_DIRECTION_KEYS.map((key) => () => createEndingDirection(key, { assets })),
      ...JUDGMENT_DIRECTION_KEYS.map((key) => () => createJudgmentDirection(key, { assets })),
    ];

    for (const render of renderers) {
      const overlay = render();
      expect(overlay.view).toBeInstanceOf(Container);
      expect(() => overlay.onEnter?.()).not.toThrow();
      expect(() => overlay.update(overlay.durationMs / 2)).not.toThrow();
      expect(overlay.complete).toBe(false);
      expect(() => overlay.update(overlay.durationMs)).not.toThrow();
      expect(overlay.complete).toBe(true);
      overlay.view.destroy({ children: true });
    }

    expect(assets.resolveUrl).toHaveBeenCalled();
  });

  it('mutes BGM exactly once without playing a cue', () => {
    const audio = audioSpies();
    const overlay = createEndingDirection('ENDING_BGM_MUTE', { audio: audio.port });

    overlay.onEnter?.();
    overlay.onEnter?.();
    overlay.update(200);

    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.mute).toHaveBeenCalledOnce();
    overlay.view.destroy({ children: true });
  });

  it('plays transfer-stamp and knock cues once from onEnter only', () => {
    const stampAudio = audioSpies();
    const stamp = createEndingDirection('ENDING_TRANSFER_STAMP', {
      audio: stampAudio.port,
    });
    stamp.update(100);
    expect(stampAudio.play).not.toHaveBeenCalled();
    stamp.onEnter?.();
    stamp.onEnter?.();
    expect(stampAudio.play).toHaveBeenCalledOnce();
    expect(stampAudio.play).toHaveBeenCalledWith(DIRECTION_AUDIO_CUES.transferStamp);
    expect(stampAudio.mute).not.toHaveBeenCalled();

    const knockAudio = audioSpies();
    const knock = createEndingDirection('ENDING_CARD_AND_KNOCK', {
      audio: knockAudio.port,
    });
    knock.update(100);
    expect(knockAudio.play).not.toHaveBeenCalled();
    knock.onEnter?.();
    knock.onEnter?.();
    expect(knockAudio.play).toHaveBeenCalledOnce();
    expect(knockAudio.play).toHaveBeenCalledWith(DIRECTION_AUDIO_CUES.knock);
    expect(knockAudio.mute).not.toHaveBeenCalled();

    stamp.view.destroy({ children: true });
    knock.view.destroy({ children: true });
  });

  it('contains no judgment/outcome code literals or code-driven branches', () => {
    const source = readFileSync(
      new URL('../../src/ui/screens/interrogation/directions.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/\b(?:R|O)_[A-Z0-9_]+\b/u);
    expect(source).not.toMatch(
      /ResolutionCode|OutcomeCode|RESOLUTION_DIRECTION_TABLE|OUTCOME_DIRECTION_TABLE/u,
    );
    expect(source).not.toMatch(/(?:if|switch)\s*\([^)]*\b(?:code|key)\b/iu);
  });
});
