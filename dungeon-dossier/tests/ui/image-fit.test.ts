import { describe, expect, it } from 'vitest';

import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { containImage, coverImage, fitImage, preservesAspect } from '../../src/ui/core/imageFit';

const BOX = { x: 0, y: 0, width: 640, height: 400 } as const;

describe('image fitting', () => {
  it('contains a source inside a box without cropping or distorting it', () => {
    // 1024x506 is 2.02:1 into a 5.2:1 band, so width is the binding constraint.
    const rect = containImage(ASSET_DIMENSIONS.result_1024x506, {
      x: 60,
      y: 18,
      width: 520,
      height: 110,
    });
    expect(rect.width).toBeLessThanOrEqual(520);
    expect(rect.height).toBeLessThanOrEqual(110);
    expect(preservesAspect(ASSET_DIMENSIONS.result_1024x506, rect)).toBe(true);
    // Centred in the leftover space on both axes, to within the grid snap.
    expect(Math.abs(rect.x - 60 - (60 + 520 - (rect.x + rect.width)))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(rect.y - 18 - (18 + 110 - (rect.y + rect.height)))).toBeLessThanOrEqual(0.5);
  });

  it('covers a box by overflowing the shorter axis, still undistorted', () => {
    const contained = containImage({ width: 100, height: 50 }, BOX);
    const covered = coverImage({ width: 100, height: 50 }, BOX);
    expect(preservesAspect({ width: 100, height: 50 }, covered)).toBe(true);
    expect(covered.width).toBeGreaterThanOrEqual(contained.width);
    expect(covered.width).toBeGreaterThanOrEqual(BOX.width);
    expect(covered.height).toBeGreaterThanOrEqual(BOX.height);
  });

  it('never enlarges a source unless asked', () => {
    const source = { width: 32, height: 32 };
    expect(containImage(source, BOX)).toMatchObject({ width: 32, height: 32 });
    const enlarged = fitImage(source, BOX, { allowUpscale: true });
    expect(enlarged.height).toBe(BOX.height);
    expect(preservesAspect(source, enlarged)).toBe(true);
  });

  it('honours the anchor and clamps nonsense values', () => {
    const source = { width: 100, height: 100 };
    expect(fitImage(source, BOX, { anchorX: 0, anchorY: 0 })).toMatchObject({ x: 0, y: 0 });
    expect(fitImage(source, BOX, { anchorX: 1, anchorY: 1 })).toMatchObject({ x: 540, y: 300 });
    // Out-of-range and non-finite anchors clamp instead of throwing the sprite
    // off-screen.
    expect(fitImage(source, BOX, { anchorX: 5 }).x).toBe(540);
    expect(fitImage(source, BOX, { anchorX: Number.NaN }).x).toBe(270);
  });

  it('snaps onto the HD texel grid so pixel art keeps hard edges', () => {
    // One HD pixel is half a logical unit at the 2x render target.
    const rect = containImage({ width: 675, height: 312 }, { x: 32, y: 40, width: 432, height: 200 });
    for (const value of [rect.x, rect.y, rect.width, rect.height]) {
      expect((value * 2) % 1).toBe(0);
    }
    const coarse = fitImage({ width: 675, height: 312 }, BOX, { renderScale: 1 });
    for (const value of [coarse.x, coarse.y, coarse.width, coarse.height]) {
      expect(value % 1).toBe(0);
    }
  });

  it('returns an empty rect rather than NaN for a degenerate box', () => {
    expect(containImage({ width: 0, height: 10 }, BOX)).toMatchObject({ width: 0, height: 0 });
    expect(containImage({ width: 10, height: 10 }, { x: 4, y: 4, width: 0, height: 0 })).toMatchObject({
      x: 4,
      y: 4,
      width: 0,
      height: 0,
    });
    expect(preservesAspect({ width: 0, height: 0 }, { width: 1, height: 1 })).toBe(false);
  });

  it('rejects the aspect break the desk plate deliberately takes', () => {
    // 1280x321 has no aspect-true integer rectangle in the 640 grid, so the
    // desk is the one placement that states its distortion instead of fitting.
    expect(preservesAspect(ASSET_DIMENSIONS.desk_foreground, { width: 640, height: 161 })).toBe(
      false,
    );
    expect(containImage(ASSET_DIMENSIONS.desk_foreground, BOX).height).toBeLessThan(161);
  });
});
