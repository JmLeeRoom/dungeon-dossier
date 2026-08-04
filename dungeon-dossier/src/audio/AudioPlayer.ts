import { Howl, type HowlOptions } from 'howler';

export type AudioChannel = 'SFX' | 'BGM' | 'STINGER';

export interface AudioDefinition {
  readonly id: string;
  readonly source: string;
  readonly loop?: boolean;
  readonly channel?: AudioChannel;
}

/** Minimal Howler surface kept small so tests and alternate runtimes can inject it. */
export interface HowlAdapter {
  play(): unknown;
  stop(): unknown;
  mute(muted: boolean): unknown;
  unload(): unknown;
}

export type HowlFactory = (options: HowlOptions) => HowlAdapter;

interface FailureState {
  failed: boolean;
}

interface RegisteredSound {
  readonly definition: AudioDefinition;
  readonly howl: HowlAdapter;
  readonly failure: FailureState;
}

const OGG_SOURCE_PATTERN = /[.]ogg(?:$|[?#])/iu;

function defaultHowlFactory(options: HowlOptions): HowlAdapter {
  return new Howl(options);
}

function silently(action: () => unknown): boolean {
  try {
    action();
    return true;
  } catch {
    return false;
  }
}

/**
 * Presentation-layer audio adapter. Missing files, unsupported IDs and Howler
 * failures are intentionally silent so unfinished audio cannot block the game.
 */
export class AudioPlayer {
  readonly #sounds = new Map<string, RegisteredSound>();
  readonly #createHowl: HowlFactory;
  #currentBgmId: string | undefined;
  #bgmMuted = false;
  #destroyed = false;

  constructor(createHowl: HowlFactory = defaultHowlFactory) {
    this.#createHowl = createHowl;
  }

  register(definition: AudioDefinition): boolean {
    if (
      this.#destroyed ||
      definition.id.trim().length === 0 ||
      !OGG_SOURCE_PATTERN.test(definition.source)
    ) {
      return false;
    }

    const failure: FailureState = { failed: false };
    let howl: HowlAdapter;
    try {
      howl = this.#createHowl({
        src: [definition.source],
        loop: definition.loop ?? false,
        preload: true,
        onloaderror: () => {
          failure.failed = true;
        },
        onplayerror: () => {
          failure.failed = true;
        },
      });
    } catch {
      return false;
    }

    if (failure.failed) {
      silently(() => howl.unload());
      return false;
    }

    const previous = this.#sounds.get(definition.id);
    if (previous !== undefined) {
      silently(() => previous.howl.stop());
      silently(() => previous.howl.unload());
      if (this.#currentBgmId === definition.id) this.#currentBgmId = undefined;
    }

    this.#sounds.set(definition.id, { definition, howl, failure });
    return true;
  }

  registerAll(definitions: Iterable<AudioDefinition>): number {
    let registered = 0;
    for (const definition of definitions) {
      if (this.register(definition)) registered += 1;
    }
    return registered;
  }

  play(id: string): boolean {
    if (this.#destroyed) return false;
    const sound = this.#sounds.get(id);
    if (sound === undefined || sound.failure.failed) return false;
    if (!silently(() => sound.howl.play())) return false;
    return !sound.failure.failed;
  }

  playBgm(id: string): boolean {
    if (this.#destroyed) return false;
    const next = this.#sounds.get(id);
    if (next === undefined || next.failure.failed) return false;
    if (this.#currentBgmId === id) return true;

    if (this.#currentBgmId !== undefined) this.#stopOne(this.#currentBgmId);
    if (this.#bgmMuted) silently(() => next.howl.mute(true));
    if (!silently(() => next.howl.play()) || next.failure.failed) return false;

    this.#currentBgmId = id;
    return true;
  }

  stop(id?: string): void {
    if (this.#destroyed) return;
    if (id !== undefined) {
      this.#stopOne(id);
      return;
    }

    for (const sound of this.#sounds.values()) {
      silently(() => sound.howl.stop());
    }
    this.#currentBgmId = undefined;
  }

  /** Mutes only the BGM lane; SFX and stingers remain audible. */
  mute(): void {
    if (this.#destroyed || this.#bgmMuted) return;
    this.#bgmMuted = true;
    const current = this.#currentBgm();
    if (current !== undefined) silently(() => current.howl.mute(true));
  }

  unmute(): void {
    if (this.#destroyed || !this.#bgmMuted) return;
    this.#bgmMuted = false;
    const current = this.#currentBgm();
    if (current !== undefined) silently(() => current.howl.mute(false));
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const sound of this.#sounds.values()) {
      silently(() => sound.howl.stop());
      silently(() => sound.howl.unload());
    }
    this.#sounds.clear();
    this.#currentBgmId = undefined;
  }

  #currentBgm(): RegisteredSound | undefined {
    return this.#currentBgmId === undefined
      ? undefined
      : this.#sounds.get(this.#currentBgmId);
  }

  #stopOne(id: string): void {
    const sound = this.#sounds.get(id);
    if (sound !== undefined) silently(() => sound.howl.stop());
    if (this.#currentBgmId === id) this.#currentBgmId = undefined;
  }
}
