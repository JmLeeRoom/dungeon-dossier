import type { HowlOptions } from 'howler';
import { describe, expect, it, vi } from 'vitest';
import {
  AudioPlayer,
  BGM_IDS,
  RUNTIME_SOUND_DEFINITIONS,
  SFX_IDS,
  SOUND_IDS,
  SOUND_REGISTRY,
  STINGER_IDS,
  resolveSoundDefinitions,
  type HowlAdapter,
} from '../../src/audio';

function inertHowl(): HowlAdapter {
  return {
    play: () => 1,
    stop: () => undefined,
    mute: () => undefined,
    unload: () => undefined,
  };
}

describe('logical sound registry', () => {
  it('covers all 13 SFX, four BGM tracks, and six stingers', () => {
    expect(SFX_IDS).toHaveLength(13);
    expect(BGM_IDS).toHaveLength(4);
    // Four of the stingers are the defeat cues, one per failure reason.
    expect(STINGER_IDS).toHaveLength(6);
    expect(SOUND_IDS).toHaveLength(23);
    expect(Object.keys(SOUND_REGISTRY).sort()).toEqual([...SOUND_IDS].sort());
    expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length);

    for (const id of SOUND_IDS) {
      const definition = SOUND_REGISTRY[id];
      expect(definition.id).toBe(id);
      expect(definition.modulePath).toMatch(/^\.\.\/\.\.\/assets\/(?:sfx|bgm)\/.+[.]ogg$/u);
    }
    for (const id of BGM_IDS) expect(SOUND_REGISTRY[id].loop).toBe(true);
    for (const id of [...SFX_IDS, ...STINGER_IDS]) {
      expect(SOUND_REGISTRY[id].loop).toBe(false);
    }
  });

  it('resolves only logical OGG files that were actually discovered', () => {
    expect(resolveSoundDefinitions({
      '../../assets/sfx/typewriter.ogg': '/built/typewriter.ogg',
      '../../assets/sfx/stamp.ogg': '/built/not-audio.mp3',
      '../../assets/bgm/bgm_ending.ogg': '/built/bgm_ending.ogg?asset',
      '../../assets/sfx/not_registered.ogg': '/built/not_registered.ogg',
    })).toEqual([
      {
        id: 'typewriter',
        source: '/built/typewriter.ogg',
        loop: false,
        channel: 'SFX',
      },
      {
        id: 'bgm_ending',
        source: '/built/bgm_ending.ogg?asset',
        loop: true,
        channel: 'BGM',
      },
    ]);

    expect(RUNTIME_SOUND_DEFINITIONS.every((definition) =>
      definition.source.toLowerCase().includes('.ogg'))).toBe(true);
  });
});

describe('AudioPlayer silent fallback', () => {
  it('registers valid definitions in bulk and returns false for missing IDs', () => {
    const createHowl = vi.fn(() => inertHowl());
    const player = new AudioPlayer(createHowl);

    expect(player.registerAll([
      { id: 'paper', source: '/paper.ogg' },
      { id: 'music', source: '/music.ogg', loop: true },
      { id: 'wrong-format', source: '/wrong.mp3' },
    ])).toBe(2);
    expect(createHowl).toHaveBeenCalledTimes(2);
    expect(player.play('paper')).toBe(true);
    expect(player.play('missing')).toBe(false);
    expect(player.playBgm('missing')).toBe(false);
  });

  it('turns construction, load, and play errors into false without throwing', () => {
    const constructionFailure = new AudioPlayer(() => {
      throw new Error('constructor failed');
    });
    expect(constructionFailure.register({ id: 'bad', source: '/bad.ogg' })).toBe(false);
    expect(constructionFailure.play('bad')).toBe(false);

    let options: HowlOptions | undefined;
    const loadFailure = new AudioPlayer((nextOptions) => {
      options = nextOptions;
      return inertHowl();
    });
    expect(loadFailure.register({ id: 'late-error', source: '/late-error.ogg' })).toBe(true);
    options?.onloaderror?.(0, new Error('load failed'));
    expect(loadFailure.play('late-error')).toBe(false);

    const playFailure = new AudioPlayer(() => ({
      ...inertHowl(),
      play: () => {
        throw new Error('play failed');
      },
    }));
    expect(playFailure.register({ id: 'silent', source: '/silent.ogg' })).toBe(true);
    expect(() => playFailure.play('silent')).not.toThrow();
    expect(playFailure.play('silent')).toBe(false);
  });

  it('tracks, switches, mutes, unmutes, stops, and destroys the BGM lane safely', () => {
    const first = {
      play: vi.fn(() => 1),
      stop: vi.fn(() => undefined),
      mute: vi.fn(() => undefined),
      unload: vi.fn(() => undefined),
    };
    const second = {
      play: vi.fn(() => 2),
      stop: vi.fn(() => undefined),
      mute: vi.fn(() => undefined),
      unload: vi.fn(() => undefined),
    };
    const player = new AudioPlayer((options) =>
      String(Array.isArray(options.src) ? options.src[0] : options.src).includes('first')
        ? first
        : second);
    player.registerAll([
      { id: 'first', source: '/first.ogg', loop: true },
      { id: 'second', source: '/second.ogg', loop: true },
    ]);

    expect(player.playBgm('first')).toBe(true);
    expect(player.playBgm('first')).toBe(true);
    expect(first.play).toHaveBeenCalledOnce();
    player.mute();
    player.mute();
    expect(first.mute).toHaveBeenCalledOnce();
    expect(first.mute).toHaveBeenCalledWith(true);

    expect(player.playBgm('second')).toBe(true);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.mute).toHaveBeenCalledWith(true);
    player.unmute();
    player.unmute();
    expect(second.mute).toHaveBeenLastCalledWith(false);

    player.stop('second');
    expect(second.stop).toHaveBeenCalledOnce();
    expect(() => player.destroy()).not.toThrow();
    player.destroy();
    expect(first.unload).toHaveBeenCalledOnce();
    expect(second.unload).toHaveBeenCalledOnce();
    expect(player.play('first')).toBe(false);
    expect(player.register({ id: 'after-destroy', source: '/after.ogg' })).toBe(false);
  });

  it('swallows stop, mute, and unload adapter exceptions', () => {
    const player = new AudioPlayer(() => ({
      play: () => 1,
      stop: () => {
        throw new Error('stop failed');
      },
      mute: () => {
        throw new Error('mute failed');
      },
      unload: () => {
        throw new Error('unload failed');
      },
    }));
    player.register({ id: 'fragile', source: '/fragile.ogg', loop: true });
    player.playBgm('fragile');

    expect(() => {
      player.mute();
      player.unmute();
      player.stop();
      player.destroy();
    }).not.toThrow();
  });
});
