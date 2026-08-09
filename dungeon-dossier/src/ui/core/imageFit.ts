import { DEFAULT_TARGET_SCALE } from './integerScale';

export interface FitSize {
  readonly width: number;
  readonly height: number;
}

export interface FitBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FittedRect extends FitBox {
  readonly scale: number;
}

export type ImageFitMode = 'contain' | 'cover';

export interface ImageFitOptions {
  readonly mode?: ImageFitMode;
  /** 0 = left/top, 0.5 = centre, 1 = right/bottom. Defaults to centred. */
  readonly anchorX?: number;
  readonly anchorY?: number;
  /**
   * Snap the result onto the HD texel grid so pixel art keeps hard edges.
   * One HD pixel is `1 / renderScale` logical units.
   */
  readonly renderScale?: number;
  /**
   * Allow the source to be enlarged past 1:1. Off by default for `contain`,
   * because enlarging pixel art is a decision; forced on for `cover`, which
   * cannot cover a box it is smaller than.
   */
  readonly allowUpscale?: boolean;
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * The one aspect-preserving placement calculator. Screens used to hard-code a
 * destination rect per illustration (640x240 here, 640x220 there), which
 * stretches any art whose ratio differs — visible immediately on the 1024x506
 * result plates. Given a source size and a box, this returns the largest
 * undistorted rect that fits (`contain`) or fills (`cover`) it.
 */
export function fitImage(
  source: FitSize,
  box: FitBox,
  options: ImageFitOptions = {},
): FittedRect {
  const mode = options.mode ?? 'contain';
  const anchorX = clamp01(options.anchorX ?? 0.5, 0.5);
  const anchorY = clamp01(options.anchorY ?? 0.5, 0.5);
  const renderScale =
    Number.isFinite(options.renderScale) && (options.renderScale ?? 0) > 0
      ? (options.renderScale as number)
      : DEFAULT_TARGET_SCALE;

  if (source.width <= 0 || source.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { x: box.x, y: box.y, width: 0, height: 0, scale: 0 };
  }

  const ratioX = box.width / source.width;
  const ratioY = box.height / source.height;
  const raw = mode === 'cover' ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY);
  const allowUpscale = options.allowUpscale ?? mode === 'cover';
  const scale = allowUpscale ? raw : Math.min(raw, 1);

  const step = 1 / renderScale;
  const snap = (value: number): number => Math.round(value / step) * step;
  const width = snap(source.width * scale);
  const height = snap(source.height * scale);

  return {
    x: snap(box.x + (box.width - width) * anchorX),
    y: snap(box.y + (box.height - height) * anchorY),
    width,
    height,
    scale,
  };
}

/** Convenience for the common case: centre a source inside a box, no upscale. */
export function containImage(source: FitSize, box: FitBox): FittedRect {
  return fitImage(source, box, { mode: 'contain' });
}

export function coverImage(source: FitSize, box: FitBox): FittedRect {
  return fitImage(source, box, { mode: 'cover' });
}

/**
 * Relative aspect tolerance. Tight enough to reject the desk plate's approved
 * 640x161 distortion (0.31% off 1280x321) and loose enough to accept a rect
 * that only moved by the half-logical-unit HD grid snap (under 0.1%).
 */
export const ASPECT_TOLERANCE = 0.002;

/** True when a destination rect keeps the source ratio to within the tolerance. */
export function preservesAspect(
  source: FitSize,
  rect: FitSize,
  tolerance = ASPECT_TOLERANCE,
): boolean {
  if (source.width <= 0 || source.height <= 0 || rect.width <= 0 || rect.height <= 0) return false;
  const sourceAspect = source.width / source.height;
  const rectAspect = rect.width / rect.height;
  return Math.abs(rectAspect - sourceAspect) / sourceAspect <= tolerance;
}
