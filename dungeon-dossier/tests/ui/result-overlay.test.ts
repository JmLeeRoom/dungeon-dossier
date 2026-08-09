import { Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer();
      Object.defineProperties(view, {
        anchor: { value: { x: 0, y: 0, set(): void {} } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { preservesAspect } from '../../src/ui/core/imageFit';
import { OUTCOME_DIRECTION_TABLE } from '../../src/ui/screens/interrogation/directionTable';
import {
  ENDING_DIRECTION_RESULTS,
  RESULT_PLATE_ASSET_KEYS,
  RESULT_PLATE_BOUNDS,
  createEndingDirection,
} from '../../src/ui/screens/interrogation/directions';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function assetsFor(expectedKey: string) {
  const requested: string[] = [];
  return {
    requested,
    lookup: {
      resolveUrl: (key: string): string | undefined => {
        requested.push(key);
        return key === expectedKey ? WHITE_TEXTURE_URL : undefined;
      },
      resolveOptionalUrl: (key: string): string | undefined => {
        requested.push(key);
        return key === expectedKey ? WHITE_TEXTURE_URL : undefined;
      },
    },
  };
}

describe('encounter result plates', () => {
  it('classifies all five outcome treatments as a clear or a fail', () => {
    expect(Object.keys(ENDING_DIRECTION_RESULTS).sort()).toEqual(
      Object.values(OUTCOME_DIRECTION_TABLE).sort(),
    );
    expect(ENDING_DIRECTION_RESULTS).toEqual({
      ENDING_POLAROID: 'clear',
      ENDING_TRANSFER_STAMP: 'clear',
      // A coerced confession still closes the case, so it reads as a clear.
      ENDING_BGM_MUTE: 'clear',
      ENDING_CARD_AND_KNOCK: 'fail',
      ENDING_OVERWORK: 'fail',
    });
    expect(RESULT_PLATE_ASSET_KEYS).toEqual({
      clear: 'ui/game/clear',
      fail: 'ui/game/fail',
    });
  });

  it('draws the matching plate over each treatment, undistorted', () => {
    for (const [key, result] of Object.entries(ENDING_DIRECTION_RESULTS)) {
      const expectedKey = RESULT_PLATE_ASSET_KEYS[result];
      const { requested, lookup } = assetsFor(expectedKey);
      const overlay = createEndingDirection(
        key as keyof typeof ENDING_DIRECTION_RESULTS,
        { assets: lookup },
      );

      expect(requested, key).toContain(expectedKey);
      const plate = overlay.view.children.at(-1);
      expect(plate, key).toBeInstanceOf(Sprite);
      if (!(plate instanceof Sprite)) throw new Error('Expected a result plate sprite.');
      // 1024x506 fitted into the band, never stretched to fill it.
      expect(preservesAspect(ASSET_DIMENSIONS.result_1024x506, plate), key).toBe(true);
      expect(plate.width, key).toBeLessThanOrEqual(RESULT_PLATE_BOUNDS.width);
      expect(plate.height, key).toBeLessThanOrEqual(RESULT_PLATE_BOUNDS.height);
      // The plate is a caption over the beat, not something to click.
      expect(plate.eventMode, key).toBe('none');

      overlay.view.destroy({ children: true });
    }
  });

  it('renders the treatment alone when no plate resolves', () => {
    const before = createEndingDirection('ENDING_POLAROID');
    expect(before.view.children.some((child) => child instanceof Sprite)).toBe(false);
    expect(before.complete).toBe(false);
    before.view.destroy({ children: true });
  });

  it('never shows a clear plate on a failing outcome', () => {
    for (const [outcome, direction] of Object.entries(OUTCOME_DIRECTION_TABLE)) {
      const result = ENDING_DIRECTION_RESULTS[direction];
      const { requested, lookup } = assetsFor(RESULT_PLATE_ASSET_KEYS[result]);
      const overlay = createEndingDirection(direction, { assets: lookup });
      const opposite = RESULT_PLATE_ASSET_KEYS[result === 'clear' ? 'fail' : 'clear'];
      expect(requested, outcome).not.toContain(opposite);
      overlay.view.destroy({ children: true });
    }
  });
});
