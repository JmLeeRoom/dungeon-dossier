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

import { toDeadSceneModel } from '../../src/app/deadScene';
import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { preservesAspect } from '../../src/ui/core/imageFit';
import {
  createDeadSceneScreen,
  createEndingScreen,
  DEAD_SCENE_ILLUSTRATION_SOURCE,
  ENDING_ILLUSTRATION_BOUNDS,
} from '../../src/ui/screens/ending';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function directSprites(view: Container): readonly Sprite[] {
  return view.children.filter((child): child is Sprite => child instanceof Sprite);
}

describe('ending and dead-scene image roles', () => {
  it('contains an optional run-ending illustration without flattening it', () => {
    const view = createEndingScreen(
      {
        endingId: 'ending-true',
        kind: 'TRUE',
        title: '완전한 조서',
        script: ['진실은 기록으로 남았다.'],
        illustrationAssetKey: 'ui/game/clear',
      },
      {
        resolveUrl: () => undefined,
        resolveOptionalUrl: () => WHITE_TEXTURE_URL,
      },
    );
    const [image] = directSprites(view);
    expect(image).toBeDefined();
    if (image === undefined) return;
    expect(preservesAspect(ASSET_DIMENSIONS.result_1024x506, image)).toBe(true);
    expect(image.width).toBeLessThanOrEqual(ENDING_ILLUSTRATION_BOUNDS.width);
    expect(image.height).toBeLessThanOrEqual(ENDING_ILLUSTRATION_BOUNDS.height);
    expect(image.eventMode).toBe('none');
    view.destroy({ children: true });
  });

  it('keeps dead background and reason illustration as two fitted layers', () => {
    const model = toDeadSceneModel({
      reason: 'STRESS_DEPLETED',
      state: {
        nodeIndex: 2,
        acquiredEvidenceIds: [],
        completedNodeIds: ['n1', 'n2'],
        stress: 0,
        retryCount: 0,
      },
      totalNodes: 9,
      coercion: 4,
      retryLimit: 2,
    });
    expect(model.backgroundAssetKey).toBe('bg/event/dead');
    expect(model.illustrationAssetKey).not.toBe('ui/game/fail');

    const required = vi.fn((key: string) => {
      expect(key).not.toBe('');
      return WHITE_TEXTURE_URL;
    });
    const controller = createDeadSceneScreen(model, {
      assets: {
        resolveUrl: () => undefined,
        resolveRequiredUrl: required,
      },
    });
    const content = controller.view.children[0];
    expect(content).toBeInstanceOf(Container);
    if (!(content instanceof Container)) return;
    const [background, reason] = directSprites(content);
    expect(background).toBeDefined();
    expect(reason).toBeDefined();
    if (background === undefined || reason === undefined) return;

    expect(preservesAspect(ASSET_DIMENSIONS.event_bg_1280x800, background)).toBe(true);
    expect(preservesAspect(DEAD_SCENE_ILLUSTRATION_SOURCE, reason)).toBe(true);
    expect(background).toMatchObject({ width: 640, height: 400, eventMode: 'none' });
    expect(reason).toMatchObject({ width: 640, height: 220, eventMode: 'none' });
    expect(content.getChildIndex(background)).toBeLessThan(content.getChildIndex(reason));
    expect(required.mock.calls.map(([key]) => key)).toEqual([
      model.backgroundAssetKey,
      model.illustrationAssetKey,
    ]);
    controller.destroy();
  });
});
