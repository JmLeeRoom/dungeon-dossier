import { describe, expect, it } from 'vitest';

import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  AssetTransformSchema,
  createAssetTransform,
  DEFAULT_ASSET_TRANSFORM,
  DISTORTION_WARNING_THRESHOLD,
  LEGACY_ASSET_MANIFEST_SCHEMA_VERSION,
  migrateAssetManifest,
  parseAssetManifest,
  resolveTransformSize,
  snapToRenderGrid,
  transformDistortion,
} from '../../src/ui/core/assetManifest';
import { DEFAULT_TARGET_SCALE } from '../../src/ui/core/integerScale';

describe('asset transform arbitrary sizing', () => {
  it('defaults to an aspect lock so pre-3.0 placements keep their exact size', () => {
    const transform = createAssetTransform({ scaleX: 0.5, scaleY: 0.5 });

    expect(transform.preserveAspectRatio).toBe(true);
    expect(transform.customWidth).toBeUndefined();
    expect(transform.customHeight).toBeUndefined();
    expect(DEFAULT_ASSET_TRANSFORM.preserveAspectRatio).toBe(true);

    // bg_interrogation is 1280x800; a 0.5 scale is the historic half-size placement.
    expect(resolveTransformSize(transform, 'bg_interrogation')).toEqual({
      width: 640,
      height: 400,
    });
  });

  it('derives the missing edge from the authored ratio when only one is given', () => {
    const byWidth = createAssetTransform({ customWidth: 320 });
    // card_base is 640x725.
    const expectedHeight =
      320 / (ASSET_DIMENSIONS.card_base.width / ASSET_DIMENSIONS.card_base.height);
    expect(resolveTransformSize(byWidth, 'card_base')).toEqual(
      snapToRenderGrid({ width: 320, height: expectedHeight }),
    );

    const byHeight = createAssetTransform({ customHeight: 64 });
    expect(resolveTransformSize(byHeight, 'evidence')).toEqual({ width: 64, height: 64 });
  });

  it('honours both edges only when the aspect lock is deliberately released', () => {
    expect(() =>
      createAssetTransform({ customWidth: 640, customHeight: 161 }),
    ).toThrow();

    const distorted = createAssetTransform({
      preserveAspectRatio: false,
      customWidth: 640,
      customHeight: 161,
    });
    expect(resolveTransformSize(distorted, 'desk_foreground')).toEqual({
      width: 640,
      height: 161,
    });
  });

  it('falls back to scale for the edge an unlocked transform leaves unset', () => {
    const partial = createAssetTransform({
      preserveAspectRatio: false,
      customWidth: 200,
      scaleY: 0.25,
    });
    expect(resolveTransformSize(partial, 'suspect_base')).toEqual({
      width: 200,
      height: ASSET_DIMENSIONS.suspect_base.height * 0.25,
    });
  });

  it('snaps sizes onto the HD pixel grid', () => {
    const step = 1 / DEFAULT_TARGET_SCALE;
    const snapped = snapToRenderGrid({ width: 100.31, height: 27.87 });

    expect(snapped.width % step).toBeCloseTo(0, 10);
    expect(snapped.height % step).toBeCloseTo(0, 10);
    expect(snapped).toEqual({ width: 100.5, height: 28 });
    // Never collapses to zero, which would make a sprite disappear.
    expect(snapToRenderGrid({ width: 0.01, height: 0.01 })).toEqual({
      width: step,
      height: step,
    });
  });

  it('pulls near-reciprocal scales onto exact 1/n so pixel art stays sharp', () => {
    const nearHalf = createAssetTransform({ scaleX: 0.4985, scaleY: 0.4985 });
    expect(resolveTransformSize(nearHalf, 'bg_interrogation')).toEqual({
      width: 640,
      height: 400,
    });

    // Well outside the tolerance stays exactly where the author put it.
    const deliberate = createAssetTransform({ scaleX: 0.4, scaleY: 0.4 });
    expect(resolveTransformSize(deliberate, 'bg_interrogation')).toEqual({
      width: 512,
      height: 320,
    });

    const authoredCardHand = createAssetTransform({ scaleX: 0.1875, scaleY: 0.1875 });
    expect(resolveTransformSize(authoredCardHand, 'card_base_768x1024')).toEqual({
      width: 144,
      height: 192,
    });
  });

  it('keeps historic V3 non-uniform scales readable while new writers normalize them', () => {
    const historic = createAssetTransform({ scaleX: 0.5, scaleY: 0.4 });
    expect(historic).toMatchObject({
      scaleX: 0.5,
      scaleY: 0.4,
      preserveAspectRatio: true,
    });
    expect(resolveTransformSize(historic, 'bg_interrogation')).toEqual({
      width: 640,
      height: 320,
    });
    expect(() =>
      createAssetTransform({ preserveAspectRatio: false, scaleX: 0.5, scaleY: 0.4 }),
    ).not.toThrow();
  });

  it('reports aspect deviation so the workbench can badge deliberate distortion', () => {
    const locked = createAssetTransform({ scaleX: 0.5, scaleY: 0.5 });
    expect(transformDistortion(locked, 'desk_foreground')).toBeCloseTo(0, 6);

    const stretched = createAssetTransform({
      preserveAspectRatio: false,
      customWidth: 640,
      customHeight: 320,
    });
    expect(transformDistortion(stretched, 'evidence')).toBeGreaterThan(
      DISTORTION_WARNING_THRESHOLD,
    );
  });
});

describe('asset manifest 2.0 to 3.0 migration', () => {
  const legacySlot = {
    dimension: 'evidence',
    image: null,
    transform: { x: 12, y: 306, rotation: 0, scaleX: 0.28125, scaleY: 0.28125 },
    isLocked: false,
  } as const;

  const legacyManifest = {
    schema_version: LEGACY_ASSET_MANIFEST_SCHEMA_VERSION,
    stage: {
      width: 640,
      height: 400,
      render_width: 1280,
      render_height: 800,
      render_scale: 2,
    },
    slots: { 'ev-1': legacySlot },
  };

  it('upgrades the version stamp and fills the aspect lock default', () => {
    const migrated = migrateAssetManifest(legacyManifest);

    expect(migrated.schema_version).toBe(ASSET_MANIFEST_SCHEMA_VERSION);
    expect(migrated.slots['ev-1']?.transform.preserveAspectRatio).toBe(true);
  });

  it('does not move a single pixel of a migrated placement', () => {
    const migrated = migrateAssetManifest(legacyManifest);
    const transform = migrated.slots['ev-1']?.transform;
    if (transform === undefined) throw new Error('migrated slot must exist');

    const before = ASSET_DIMENSIONS.evidence.width * legacySlot.transform.scaleX;
    expect(resolveTransformSize(transform, 'evidence')).toEqual(
      snapToRenderGrid({ width: before, height: before }),
    );
    expect(transform.x).toBe(legacySlot.transform.x);
    expect(transform.y).toBe(legacySlot.transform.y);
  });

  it('accepts an already-current manifest unchanged', () => {
    const current = migrateAssetManifest(legacyManifest);
    expect(migrateAssetManifest(current)).toEqual(current);
  });

  it('accepts a historic V3 workbench manifest with rounded non-uniform scales', () => {
    const historicV3 = {
      ...legacyManifest,
      schema_version: ASSET_MANIFEST_SCHEMA_VERSION,
      slots: {
        'ev-1': {
          ...legacySlot,
          transform: {
            ...legacySlot.transform,
            scaleY: 0.283,
            preserveAspectRatio: true,
          },
        },
      },
    };

    expect(parseAssetManifest(historicV3)).toEqual(historicV3);
  });

  it('rejects a manifest whose transform violates the aspect-lock contract', () => {
    expect(() =>
      AssetTransformSchema.parse({
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        customWidth: 10,
        customHeight: 20,
      }),
    ).toThrow(/preserveAspectRatio/u);
  });
});
