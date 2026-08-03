import { describe, expect, it } from 'vitest';
import { buildAssetRegistry, parseAssetFilename } from '../../src/ui/core/assetRegistry';
import { calculateIntegerViewport } from '../../src/ui/core/integerScale';

describe('presentation foundation', () => {
  it('uses an integer scale and letterboxes the 640x400 stage', () => {
    expect(calculateIntegerViewport(1280, 900)).toEqual({
      scale: 2,
      width: 1280,
      height: 800,
      offsetX: 0,
      offsetY: 50,
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

