import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import {
  ASSET_DIMENSIONS,
  ASSET_DIMENSION_IDS,
  assertAssetDimension,
  assetAspectRatio,
  isAssetDimensionId,
  matchesAssetAspectRatio,
  matchesAssetDimension,
  type AssetDimensionId,
} from '../../src/ui/core/assetDimensions';
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  AssetManifestSchema,
  createAssetManifest,
  createAssetManifestSlot,
  createAssetTransform,
  degreesToRadians,
  normalizeRotation,
  parseAssetManifest,
  radiansToDegrees,
  serializeAssetManifest,
} from '../../src/ui/core/assetManifest';
import { CARD_SIZE } from '../../src/ui/widgets/cardLayout';
import {
  CANONICAL_SLOTS,
  buildAssetManifest,
  createInitialWorkbenchState,
  getSlotSourceDimension,
} from '../../workbench/model.mts';

const ASSETS_ROOT = fileURLToPath(new URL('../../assets/', import.meta.url));

/** Maps a checked-in PNG to the standard it must satisfy. */
function dimensionForAsset(relativePath: string): AssetDimensionId | undefined {
  const [directory, file] = relativePath.split('/');
  if (directory === undefined || file === undefined) return undefined;
  if (directory === 'bg') return 'bg_interrogation';
  if (directory === 'fg') return 'desk_foreground';
  if (directory === 'evidence') return 'evidence';
  if (directory === 'portraits') {
    if (file.endsWith('_upset.png') || file.endsWith('_lose.png')) return 'suspect_state_parts';
    if (file.endsWith('_used.png')) return 'partner';
    return 'suspect_base';
  }
  if (directory === 'cards') return file.endsWith('_템플릿.png') ? 'card_base' : 'card_illust';
  if (directory === 'ui' && file.startsWith('아이콘_평정심')) return 'icon_composure';
  if (directory === 'ui' && file.startsWith('아이콘_강압')) return 'icon_coercion';
  return undefined;
}

async function pngFiles(directory: string, prefix = ''): Promise<readonly string[]> {
  const entries = await readdir(path.join(ASSETS_ROOT, directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => `${prefix}${directory}/${entry.name}`);
}

describe('standard asset dimensions', () => {
  it('publishes exactly the ten specified source sizes', () => {
    expect(ASSET_DIMENSION_IDS).toEqual([
      'bg_interrogation',
      'desk_foreground',
      'suspect_base',
      'suspect_state_parts',
      'partner',
      'card_base',
      'card_illust',
      'evidence',
      'icon_composure',
      'icon_coercion',
    ]);
    expect(ASSET_DIMENSIONS).toEqual({
      bg_interrogation: { width: 1280, height: 800 },
      desk_foreground: { width: 1280, height: 236 },
      suspect_base: { width: 512, height: 512 },
      suspect_state_parts: { width: 512, height: 512 },
      partner: { width: 512, height: 512 },
      card_base: { width: 640, height: 725 },
      card_illust: { width: 256, height: 256 },
      evidence: { width: 128, height: 128 },
      icon_composure: { width: 32, height: 32 },
      icon_coercion: { width: 32, height: 32 },
    });
    expect(CARD_SIZE).toEqual({ width: 640, height: 725 });
  });

  it('validates exact sizes and scaled aspect ratios separately', () => {
    expect(isAssetDimensionId('card_base')).toBe(true);
    expect(isAssetDimensionId('card_backside')).toBe(false);
    expect(matchesAssetDimension('evidence', { width: 128, height: 128 })).toBe(true);
    expect(matchesAssetDimension('evidence', { width: 64, height: 64 })).toBe(false);
    expect(matchesAssetAspectRatio('evidence', { width: 64, height: 64 })).toBe(true);
    expect(matchesAssetAspectRatio('desk_foreground', { width: 640, height: 118 })).toBe(true);
    expect(matchesAssetAspectRatio('desk_foreground', { width: 640, height: 120 })).toBe(false);
    expect(assetAspectRatio('bg_interrogation')).toBe(1.6);
    expect(() => assertAssetDimension('icon_composure', { width: 32, height: 32 })).not.toThrow();
    expect(() => assertAssetDimension('icon_composure', { width: 16, height: 16 })).toThrow(
      /must be 32x32px, received 16x16px/u,
    );
  });

  it('keeps every workbench slot rectangle aspect-true to its source asset', () => {
    for (const definition of CANONICAL_SLOTS) {
      expect(
        matchesAssetAspectRatio(definition.dimension, definition.defaultRect),
        `${definition.id} (${definition.defaultRect.width}x${definition.defaultRect.height}) vs ${definition.dimension}`,
      ).toBe(true);
      expect(getSlotSourceDimension(definition.id)).toEqual(
        ASSET_DIMENSIONS[definition.dimension],
      );
    }
  });

  it('ships every checked-in PNG at its declared source size', async () => {
    const files = [
      ...(await pngFiles('bg')),
      ...(await pngFiles('fg')),
      ...(await pngFiles('portraits')),
      ...(await pngFiles('cards')),
      ...(await pngFiles('evidence')),
      ...(await pngFiles('ui')),
    ];
    expect(files.length).toBeGreaterThan(0);

    const checked: string[] = [];
    for (const relativePath of files) {
      const dimension = dimensionForAsset(relativePath);
      if (dimension === undefined) continue;
      const png = PNG.sync.read(await readFile(path.join(ASSETS_ROOT, relativePath)));
      expect(
        { width: png.width, height: png.height },
        `${relativePath} must match ${dimension}`,
      ).toEqual(ASSET_DIMENSIONS[dimension]);
      checked.push(relativePath);
    }

    // Backgrounds, desk, 12 portraits x 3 states, partner used, card base,
    // 3 illustrations, 3 evidence icons, and the two HUD icons.
    expect(checked).toHaveLength(50);
  });
});

describe('asset manifest schema', () => {
  it('accepts a locked transform and rejects unknown dimensions or zero scale', () => {
    const slot = createAssetManifestSlot('card_base', {
      image: 'card_기본_템플릿.png',
      transform: createAssetTransform({ x: 256, y: 371, rotation: 0.25, scaleX: 0.2, scaleY: 0.2 }),
      isLocked: true,
    });
    const manifest = createAssetManifest({ 'card-base': slot });

    expect(manifest.schema_version).toBe(ASSET_MANIFEST_SCHEMA_VERSION);
    expect(manifest.stage).toEqual({
      width: 640,
      height: 400,
      render_width: 1280,
      render_height: 800,
      render_scale: 2,
    });
    expect(parseAssetManifest(JSON.parse(serializeAssetManifest(manifest)))).toEqual(manifest);
    expect(serializeAssetManifest(manifest).endsWith('\n')).toBe(true);

    expect(() => createAssetManifestSlot('card_base', { transform: { ...slot.transform, scaleX: 0 } }))
      .toThrow();
    expect(
      AssetManifestSchema.safeParse({
        ...manifest,
        slots: { bad: { ...slot, dimension: 'card_backside' } },
      }).success,
    ).toBe(false);
    expect(
      AssetManifestSchema.safeParse({
        ...manifest,
        stage: { ...manifest.stage, width: 1280, height: 800 },
      }).success,
    )
      .toBe(false);
  });

  it('stores rotation in radians normalized to a single turn', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 10);
    expect(normalizeRotation(Math.PI * 4)).toBeCloseTo(0, 10);
    expect(normalizeRotation(Number.NaN)).toBe(0);
    expect(radiansToDegrees(degreesToRadians(45))).toBeCloseTo(45, 10);
  });

  it('derives every slot transform from the workbench state', () => {
    const manifest = buildAssetManifest(createInitialWorkbenchState());
    expect(Object.keys(manifest.slots)).toEqual(CANONICAL_SLOTS.map((slot) => slot.id));
    expect(manifest.slots['bg-room']).toEqual({
      dimension: 'bg_interrogation',
      image: null,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 0.5, scaleY: 0.5 },
      isLocked: false,
    });
    expect(manifest.slots['icon-composure']?.transform).toEqual({
      x: 139,
      y: 5,
      rotation: 0,
      scaleX: 0.5,
      scaleY: 0.5,
    });
    expect(parseAssetManifest(manifest)).toEqual(manifest);
  });
});
