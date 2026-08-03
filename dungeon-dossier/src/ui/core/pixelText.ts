import {
  BitmapFontManager,
  BitmapText,
  TextStyle,
  type ColorSource,
  type TextStyleOptions,
} from 'pixi.js';

/** The sole CSS font family used to rasterize the Hangul bitmap glyph atlas. */
export const PIXEL_FONT_FAMILY = 'Galmuri11' as const;

export interface PixelTextOptions {
  readonly fontSize?: number;
  readonly fill?: ColorSource;
  readonly wordWrap?: boolean;
  readonly wordWrapWidth?: number;
  readonly align?: TextStyleOptions['align'];
  readonly letterSpacing?: number;
  readonly lineHeight?: number;
}

export interface NormalizedPixelTextOptions {
  readonly fontSize: number;
  readonly fill: ColorSource;
  readonly wordWrap: boolean;
  readonly wordWrapWidth: number;
  readonly align: NonNullable<TextStyleOptions['align']>;
  readonly letterSpacing: number;
  readonly lineHeight: number;
}

const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FILL = 0xf4e7c5;

function finiteInteger(value: number | undefined, fallback: number, minimum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`Expected a finite number greater than or equal to ${minimum}.`);
  }
  return Math.round(value);
}

export function normalizePixelTextOptions(
  options: PixelTextOptions = {},
): NormalizedPixelTextOptions {
  const fontSize = finiteInteger(options.fontSize, DEFAULT_FONT_SIZE, 1);
  const wordWrapWidth = finiteInteger(options.wordWrapWidth, 0, 0);
  return {
    fontSize,
    fill: options.fill ?? DEFAULT_FILL,
    wordWrap: options.wordWrap ?? false,
    wordWrapWidth,
    align: options.align ?? 'left',
    letterSpacing: finiteInteger(options.letterSpacing, 0, 0),
    lineHeight: finiteInteger(options.lineHeight, fontSize, 1),
  };
}

export function collectUniqueGlyphs(text: string): string {
  return [...new Set(Array.from(text))].join('');
}

function createBitmapStyle(options: NormalizedPixelTextOptions): TextStyleOptions {
  return {
    fontFamily: PIXEL_FONT_FAMILY,
    fontSize: options.fontSize,
    // A white atlas can be shared by every requested text colour via tint.
    fill: 0xffffff,
    align: options.align,
    wordWrap: options.wordWrap,
    wordWrapWidth: options.wordWrapWidth,
    letterSpacing: options.letterSpacing,
    lineHeight: options.lineHeight,
  };
}

function configureNearestBitmapGlyphs(): void {
  const textureStyle = BitmapFontManager.defaultOptions.textureStyle;
  if (textureStyle != null && textureStyle.scaleMode === 'nearest') return;
  BitmapFontManager.defaultOptions.textureStyle = {
    ...(textureStyle ?? {}),
    scaleMode: 'nearest',
  };
  BitmapFontManager.defaultOptions.resolution = 1;
}

/**
 * Lazily primes only glyphs actually used by dossier/card copy. Pixi retains
 * the dynamic bitmap atlas; this set prevents repeated long-string scans.
 */
export class PixelGlyphCache {
  readonly #glyphs = new Set<string>();

  get size(): number {
    return this.#glyphs.size;
  }

  has(glyph: string): boolean {
    return this.#glyphs.has(glyph);
  }

  prime(text: string, options: PixelTextOptions = {}): string {
    const missing = Array.from(collectUniqueGlyphs(text)).filter((glyph) => !this.#glyphs.has(glyph));
    if (missing.length === 0) return '';

    configureNearestBitmapGlyphs();
    const missingText = missing.join('');
    const style = new TextStyle(createBitmapStyle(normalizePixelTextOptions(options)));
    BitmapFontManager.getFont(missingText, style);
    for (const glyph of missing) this.#glyphs.add(glyph);
    return missingText;
  }

  clear(): void {
    this.#glyphs.clear();
  }
}

export const defaultPixelGlyphCache = new PixelGlyphCache();

export function createPixelText(text: string, options: PixelTextOptions = {}): BitmapText {
  const normalized = normalizePixelTextOptions(options);
  defaultPixelGlyphCache.prime(text, normalized);

  const bitmapText = new BitmapText({
    text,
    style: createBitmapStyle(normalized),
  });
  bitmapText.tint = normalized.fill;
  bitmapText.roundPixels = true;
  return bitmapText;
}
