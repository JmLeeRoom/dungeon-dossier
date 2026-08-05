import { describe, expect, it } from 'vitest';
import { buildAssetRegistry, parseAssetFilename } from '../../src/ui/core/assetRegistry';
import {
  calculateIntegerViewport,
  DEFAULT_TARGET_SCALE,
  HD_HEIGHT,
  HD_WIDTH,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from '../../src/ui/core/integerScale';

describe('presentation foundation', () => {
  it('keeps the 640x400 layout grid and exposes the 1280x800 HD target', () => {
    expect({
      internalWidth: INTERNAL_WIDTH,
      internalHeight: INTERNAL_HEIGHT,
      hdWidth: HD_WIDTH,
      hdHeight: HD_HEIGHT,
      targetScale: DEFAULT_TARGET_SCALE,
    }).toEqual({
      internalWidth: 640,
      internalHeight: 400,
      hdWidth: 1280,
      hdHeight: 800,
      targetScale: 2,
    });
  });

  it('uses a 2x integer scale for the 1280x800 HD viewport', () => {
    expect(calculateIntegerViewport(1280, 800)).toEqual({
      scale: 2,
      width: 1280,
      height: 800,
      offsetX: 0,
      offsetY: 0,
      fits: true,
    });
  });

  it('parses the asset registry from filenames', () => {
    expect(parseAssetFilename('/assets/bg/배경_심문실_시안.png', '/url.png')).toEqual({
      category: '배경',
      name: '심문실',
      state: '시안',
      url: '/url.png',
    });

    const registry = buildAssetRegistry({
      '/assets/ui/아이콘_평정심_기본.png': '/icon.png',
    });
    expect(registry.get('아이콘/평정심/기본')?.url).toBe('/icon.png');
  });
});
