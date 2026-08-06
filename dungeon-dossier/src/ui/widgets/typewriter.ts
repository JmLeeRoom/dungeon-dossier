import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface TypewriterSnapshot {
  readonly visibleText: string;
  readonly emittedCharacters: number;
  readonly caughtUp: boolean;
  readonly complete: boolean;
}

/**
 * Renderer-free queue shared by live chunks and fallback dialogue. Calling
 * append() never records where a chunk came from, so both paths animate alike.
 */
export class TypewriterStream {
  readonly #intervalMs: number;
  #characters: string[] = [];
  #visibleCount = 0;
  #elapsedMs = 0;
  #complete = false;

  constructor(intervalMs = 32) {
    this.#intervalMs = Math.max(1, intervalMs);
  }

  append(chunk: string): TypewriterSnapshot {
    const characters = Array.from(chunk);
    this.#characters.push(...characters);
    let emittedCharacters = 0;
    if (characters.length > 0 && this.#visibleCount === 0) {
      this.#visibleCount = 1;
      emittedCharacters = 1;
    }
    return this.#snapshot(emittedCharacters);
  }

  finish(): TypewriterSnapshot {
    this.#complete = true;
    return this.#snapshot(0);
  }

  reset(): void {
    this.#characters = [];
    this.#visibleCount = 0;
    this.#elapsedMs = 0;
    this.#complete = false;
  }

  advance(elapsedMs: number): TypewriterSnapshot {
    if (Number.isFinite(elapsedMs) && elapsedMs > 0) this.#elapsedMs += elapsedMs;
    const available = this.#characters.length - this.#visibleCount;
    const requested = Math.floor(this.#elapsedMs / this.#intervalMs);
    const emittedCharacters = Math.min(available, requested);
    if (emittedCharacters > 0) {
      this.#visibleCount += emittedCharacters;
      this.#elapsedMs -= emittedCharacters * this.#intervalMs;
    } else if (available === 0) {
      this.#elapsedMs = Math.min(this.#elapsedMs, this.#intervalMs - 1);
    }
    return this.#snapshot(emittedCharacters);
  }

  snapshot(): TypewriterSnapshot {
    return this.#snapshot(0);
  }

  #snapshot(emittedCharacters: number): TypewriterSnapshot {
    const caughtUp = this.#visibleCount === this.#characters.length;
    return {
      visibleText: this.#characters.slice(0, this.#visibleCount).join(''),
      emittedCharacters,
      caughtUp,
      complete: this.#complete && caughtUp,
    };
  }
}

export function caretVisible(elapsedMs: number, periodMs = 640): boolean {
  const safePeriod = Math.max(2, periodMs);
  const normalized = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % safePeriod;
  return normalized < safePeriod / 2;
}

export interface TypewriterController {
  readonly view: Container;
  readonly stream: TypewriterStream;
  append(chunk: string): void;
  finish(): void;
  useFallback(text: string): void;
  update(elapsedMs: number): void;
}

export interface TypewriterOptions {
  readonly width?: number;
  readonly height?: number;
  readonly intervalMs?: number;
  readonly onKeystroke?: () => void;
}

let intervalOverrideMs: number | undefined;

/**
 * DEV automation hook: overrides the per-character delay for typewriters
 * created afterwards (e.g. cinematic recording pace). Pass undefined to reset.
 */
export function setTypewriterIntervalOverride(intervalMs?: number): void {
  intervalOverrideMs =
    intervalMs !== undefined && Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : undefined;
}

/** Purely exposes the effective interval calculation for lifecycle regression tests. */
export function resolveTypewriterIntervalMs(intervalMs = 32): number {
  return intervalOverrideMs ?? intervalMs;
}

export function createTypewriter(options: TypewriterOptions = {}): TypewriterController {
  const width = options.width ?? 436;
  const height = options.height ?? 56;
  const view = new Container();
  const stream = new TypewriterStream(
    resolveTypewriterIntervalMs(options.intervalMs ?? 32),
  );
  const frame = new Graphics()
    .rect(0, 0, width, height)
    .fill({ color: UI_PALETTE.deepInk, alpha: 0.94 })
    .stroke({ color: UI_PALETTE.parchmentDark, width: 2 });
  const text = createPixelText('', {
    fontSize: 9,
    fill: UI_PALETTE.parchment,
    lineHeight: 13,
    wordWrap: true,
    wordWrapWidth: width - 22,
  });
  text.position.set(9, 7);
  const caret = new Graphics().rect(0, 0, 5, 9).fill(UI_PALETTE.parchment);
  caret.position.set(10, 8);
  view.addChild(frame, text, caret);

  let caretElapsed = 0;
  const render = (snapshot: TypewriterSnapshot): void => {
    text.text = snapshot.visibleText;
    const line = snapshot.visibleText.split('\n').at(-1) ?? '';
    caret.position.set(
      Math.min(width - 14, 9 + line.length * 9),
      Math.min(height - 13, 8 + (snapshot.visibleText.split('\n').length - 1) * 13),
    );
    if (snapshot.emittedCharacters > 0) {
      for (let index = 0; index < snapshot.emittedCharacters; index += 1) {
        options.onKeystroke?.();
      }
    }
    caret.visible = !snapshot.complete && caretVisible(caretElapsed);
  };

  return {
    view,
    stream,
    append(chunk): void {
      render(stream.append(chunk));
    },
    finish(): void {
      render(stream.finish());
    },
    useFallback(fallbackText): void {
      stream.reset();
      render(stream.append(fallbackText));
      render(stream.finish());
    },
    update(elapsedMs): void {
      caretElapsed += Math.max(0, elapsedMs);
      render(stream.advance(elapsedMs));
    },
  };
}
