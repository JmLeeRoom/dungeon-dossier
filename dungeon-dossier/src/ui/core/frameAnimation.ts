export const MIN_SPRITESHEET_FRAMES = 3;
export const MAX_SPRITESHEET_FRAMES = 4;

export interface FrameCycleSample<T> {
  readonly index: number;
  readonly frame: T;
  readonly elapsedMs: number;
  readonly changed: boolean;
}

export function assertFrameCycleLength(frameCount: number): void {
  if (
    !Number.isInteger(frameCount) ||
    frameCount < MIN_SPRITESHEET_FRAMES ||
    frameCount > MAX_SPRITESHEET_FRAMES
  ) {
    throw new RangeError('Frame animations must contain exactly 3 or 4 frames.');
  }
}

export function frameIndexAtElapsed(
  elapsedMs: number,
  frameCount: number,
  frameDurationMs: number,
  initialIndex = 0,
): number {
  assertFrameCycleLength(frameCount);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('elapsedMs must be a finite, non-negative number.');
  }
  if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0) {
    throw new RangeError('frameDurationMs must be a finite, positive number.');
  }
  if (!Number.isInteger(initialIndex) || initialIndex < 0 || initialIndex >= frameCount) {
    throw new RangeError('initialIndex must address an existing frame.');
  }

  return (initialIndex + Math.floor(elapsedMs / frameDurationMs)) % frameCount;
}

/**
 * Fixed-rate spritesheet frame cycler. It owns no clock: the UI ticker must
 * provide elapsed milliseconds explicitly, keeping time out of the engine.
 */
export class FrameAnimation<T> {
  readonly frames: readonly T[];
  readonly frameDurationMs: number;

  #elapsedMs = 0;
  #initialIndex: number;
  #index: number;

  constructor(frames: readonly T[], frameDurationMs: number, initialIndex = 0) {
    assertFrameCycleLength(frames.length);
    // Reuse the pure validator for duration and initial-index constraints.
    frameIndexAtElapsed(0, frames.length, frameDurationMs, initialIndex);
    this.frames = [...frames];
    this.frameDurationMs = frameDurationMs;
    this.#initialIndex = initialIndex;
    this.#index = initialIndex;
  }

  get elapsedMs(): number {
    return this.#elapsedMs;
  }

  get index(): number {
    return this.#index;
  }

  get frame(): T {
    return this.frames[this.#index] as T;
  }

  advance(deltaMs: number): FrameCycleSample<T> {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('deltaMs must be a finite, non-negative number.');
    }

    const previous = this.#index;
    this.#elapsedMs += deltaMs;
    this.#index = frameIndexAtElapsed(
      this.#elapsedMs,
      this.frames.length,
      this.frameDurationMs,
      this.#initialIndex,
    );
    return this.#sample(previous !== this.#index);
  }

  seek(elapsedMs: number): FrameCycleSample<T> {
    const previous = this.#index;
    this.#index = frameIndexAtElapsed(
      elapsedMs,
      this.frames.length,
      this.frameDurationMs,
      this.#initialIndex,
    );
    this.#elapsedMs = elapsedMs;
    return this.#sample(previous !== this.#index);
  }

  reset(initialIndex = 0): FrameCycleSample<T> {
    frameIndexAtElapsed(0, this.frames.length, this.frameDurationMs, initialIndex);
    const previous = this.#index;
    this.#initialIndex = initialIndex;
    this.#elapsedMs = 0;
    this.#index = initialIndex;
    return this.#sample(previous !== this.#index);
  }

  #sample(changed: boolean): FrameCycleSample<T> {
    return {
      index: this.#index,
      frame: this.frame,
      elapsedMs: this.#elapsedMs,
      changed,
    };
  }
}
