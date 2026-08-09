import { Container, Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer();
      Object.defineProperties(view, {
        anchor: { value: { set(): void {} } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { preservesAspect } from '../../src/ui/core/imageFit';
import {
  createEventScreen,
  eventSceneAssetKeys,
  type EventSceneModel,
} from '../../src/ui/screens/event';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const MODEL: EventSceneModel = {
  eventId: 'event_tutorial_choice',
  title: '탕비실 야근',
  description: '단서를 더 찾을지 정한다.',
  pattern: 'A',
  choices: [],
  backgroundAssetKey: 'bg/event/rest',
  decoration: {
    assetKey: 'bg/event/post',
    x: 395,
    y: 176,
    width: 181,
    height: 156,
  },
};

describe('event scene asset composition', () => {
  it('returns only the current event background and decoration for preload', () => {
    expect(eventSceneAssetKeys(MODEL)).toEqual(['bg/event/rest', 'bg/event/post']);
    const { decoration, ...withoutDecoration } = MODEL;
    expect(decoration?.assetKey).toBe('bg/event/post');
    expect(eventSceneAssetKeys(withoutDecoration)).toEqual(['bg/event/rest']);
  });

  it('draws background, translucent-panel layer, then decoration and copy', () => {
    const required = vi.fn(() => WHITE_TEXTURE_URL);
    const view = createEventScreen(MODEL, {}, {
      assets: {
        resolveUrl: () => undefined,
        resolveRequiredUrl: required,
      },
    });

    const sprites = view.children.filter((child): child is Sprite => child instanceof Sprite);
    expect(sprites).toHaveLength(2);
    const [background, decoration] = sprites;
    expect(background).toBeDefined();
    expect(decoration).toBeDefined();
    if (background === undefined || decoration === undefined) return;

    expect(preservesAspect(ASSET_DIMENSIONS.event_bg_1280x800, background)).toBe(true);
    expect(preservesAspect(ASSET_DIMENSIONS.event_overlay_181x156, decoration)).toBe(true);
    expect(background).toMatchObject({ width: 640, height: 400, eventMode: 'none' });
    expect(decoration).toMatchObject({ width: 181, height: 156, eventMode: 'none' });

    const backgroundIndex = view.getChildIndex(background);
    const decorationIndex = view.getChildIndex(decoration);
    // deep-ink fallback, background, panel, decoration, then title/pattern/copy.
    expect(backgroundIndex).toBe(1);
    expect(decorationIndex).toBe(3);
    expect(decorationIndex).toBeLessThan(view.children.length - 1);
    expect(required).toHaveBeenCalledWith(
      'bg/event/rest',
      expect.objectContaining({ screen: 'event', slotId: 'background', bundle: 'event' }),
    );
    expect(required).toHaveBeenCalledWith(
      'bg/event/post',
      expect.objectContaining({ screen: 'event', slotId: 'decoration', bundle: 'event' }),
    );
    view.destroy({ children: true });
  });

  it('propagates a required asset failure instead of mounting a blank event', () => {
    const missing = new Error('missing required event plate');
    expect(() => createEventScreen(MODEL, {}, {
      assets: {
        resolveUrl: () => undefined,
        resolveRequiredUrl: () => {
          throw missing;
        },
      },
    })).toThrow(missing);
  });

  it('still supports a vector-only model in isolated UI tests', () => {
    const vectorModel: EventSceneModel = {
      eventId: MODEL.eventId,
      title: MODEL.title,
      description: MODEL.description,
      pattern: 'A',
      choices: [],
    };
    const view = createEventScreen(vectorModel);
    expect(view).toBeInstanceOf(Container);
    expect(view.children.some((child) => child instanceof Sprite)).toBe(false);
    view.destroy({ children: true });
  });
});
