import { describe, expect, it } from 'vitest';

import {
  ASSET_PLACEMENTS,
  CANONICAL_ASSET_MANIFEST,
  applyAssetPlacement,
  buildPlacementRegistry,
  requireAssetPlacement,
} from '../../src/ui/core/placementRegistry';
import { catalogEntryByFileName } from '../../src/ui/core/runtimeAssetCatalog';
import {
  DESK_LOGICAL_HEIGHT,
  DESK_TOP,
} from '../../src/ui/screens/interrogation/createInterrogationScreen';
import {
  SLOT_IDS,
  buildAssetManifest,
  collectWorkbenchSaveRequest,
  createShippingWorkbenchState,
  normalizeWorkbenchState,
  withStageSlotImage,
} from '../../workbench/model.mts';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('canonical asset placement registry', () => {
  it('is exactly the locked sixteen-slot shipping workbench manifest', () => {
    const shippingState = normalizeWorkbenchState(createShippingWorkbenchState());

    expect(CANONICAL_ASSET_MANIFEST).toEqual(buildAssetManifest(shippingState));
    expect(Object.keys(CANONICAL_ASSET_MANIFEST.slots)).toEqual(SLOT_IDS);
    expect(ASSET_PLACEMENTS.size).toBe(16);
    expect(
      Object.values(CANONICAL_ASSET_MANIFEST.slots).every(
        (slot) => slot.image !== null && slot.isLocked,
      ),
    ).toBe(true);
  });

  it('resolves every checked-in basename through the measured runtime catalog', () => {
    for (const placement of ASSET_PLACEMENTS.values()) {
      expect(catalogEntryByFileName(placement.imageFileName)?.key, placement.slotId).toBe(
        placement.assetKey,
      );
      expect(placement.url, placement.slotId).not.toBe('');
      expect(placement.isLocked, placement.slotId).toBe(true);
    }
  });

  it('preserves the interrogation layout that preceded manifest consumption', () => {
    expect(requireAssetPlacement('bg-room')).toMatchObject({
      assetKey: 'bg/interrogationroom/base',
      x: 0,
      y: 0,
      width: 640,
      height: 400,
    });
    expect(requireAssetPlacement('fg-desk')).toMatchObject({
      assetKey: 'bg/interrogationroom/desk',
      x: 0,
      y: 239,
      width: 640,
      height: 161,
    });
    expect(requireAssetPlacement('suspect-base')).toMatchObject({
      x: 212,
      y: 34,
      width: 216,
      height: 216,
    });
    expect(requireAssetPlacement('partner-base')).toMatchObject({
      x: 546,
      y: 296,
      width: 88,
      height: 88,
    });
    expect(DESK_TOP).toBe(239);
    expect(DESK_LOGICAL_HEIGHT).toBe(161);
  });

  it('keeps HUD anchors and the production card hand at its authored placement', () => {
    expect(requireAssetPlacement('icon-composure')).toMatchObject({
      assetKey: 'ui/icon/composure',
      x: 139,
      y: 5,
      width: 16,
      height: 16,
    });
    expect(requireAssetPlacement('icon-coercion')).toMatchObject({
      assetKey: 'ui/icon/pushy',
      x: 326,
      y: 5,
      width: 16,
      height: 16,
    });
    expect(requireAssetPlacement('card-base')).toMatchObject({
      assetKey: 'ui/card/base',
      x: 248,
      y: 362,
      width: 144,
      height: 192,
    });
  });

  it('keeps all sixteen bindings after a one-slot workbench upload', () => {
    const edited = withStageSlotImage(createShippingWorkbenchState(), 'card-base', {
      dataUrl: PNG_DATA_URL,
      originalName: 'ui_card_base.png',
    });
    const request = collectWorkbenchSaveRequest(edited);
    const rebuilt = buildPlacementRegistry(request.manifest, (key) => `/test/${key}.png`);

    expect(request.files.map((file) => file.path)).toEqual([
      'cards/card_\uae30\ubcf8_\ud15c\ud50c\ub9bf.png',
    ]);
    expect(Object.keys(request.manifest.slots)).toEqual(SLOT_IDS);
    expect(Object.values(request.manifest.slots).every((slot) => slot.image !== null)).toBe(true);
    expect(Object.values(request.manifest.slots).every((slot) => slot.isLocked)).toBe(true);
    expect([...rebuilt.keys()]).toEqual(SLOT_IDS);
    expect(rebuilt.size).toBe(16);
  });

  it('applies one resolved placement without requiring a Pixi object', () => {
    const coordinates: number[] = [];
    const target = {
      position: { set: (x: number, y: number) => coordinates.push(x, y) },
      width: 0,
      height: 0,
      rotation: 99,
    };
    applyAssetPlacement(target, requireAssetPlacement('suspect-base'));
    expect(coordinates).toEqual([212, 34]);
    expect(target).toMatchObject({ width: 216, height: 216, rotation: 0 });
  });

  it('fails explicitly when a required workbench slot is absent', () => {
    expect(() => requireAssetPlacement('not-a-slot')).toThrow(
      /Required asset placement is missing/u,
    );
  });
});
