import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SLOTS,
  PORTRAIT_PARTS_JSON_NAME,
  SLOT_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WORKBENCH_STATE_VERSION,
  WORKBENCH_STORAGE_KEY,
  buildPortraitPartsManifest,
  canonicalDownloadName,
  clampRect,
  createDefaultGeometry,
  createInitialWorkbenchState,
  getPartsOffset,
  isPngDataUrl,
  loadWorkbenchState,
  normalizeWorkbenchState,
  nudgeRect,
  patchRect,
  resetAllGeometry,
  resetSlotGeometry,
  saveWorkbenchState,
  serializePortraitPartsManifest,
  validatePngDescriptor,
  withPartsOffset,
  withSlotImage,
  withSlotRect,
  withoutSlotImage,
  type StorageLike,
} from '../../workbench/model.mts';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('planner workbench canonical slots', () => {
  it('defines exactly the thirteen measured slots in the 640x400 stage', () => {
    expect({ width: STAGE_WIDTH, height: STAGE_HEIGHT }).toEqual({
      width: 640,
      height: 400,
    });
    expect(SLOT_IDS).toEqual([
      'bg-room',
      'portrait-base',
      'portrait-parts',
      'fg-desk',
      'card-art-1',
      'card-art-2',
      'card-art-3',
      'ev-1',
      'ev-2',
      'ev-3',
      'icon-composure',
      'icon-coercion',
      'partner',
    ]);
    expect(CANONICAL_SLOTS).toHaveLength(13);
    expect(new Set(CANONICAL_SLOTS.map((slot) => slot.id)).size).toBe(13);

    expect(createDefaultGeometry()).toEqual({
      'bg-room': { x: 0, y: 0, width: 640, height: 400 },
      'portrait-base': { x: 222, y: 40, width: 196, height: 216 },
      'portrait-parts': { x: 272, y: 84, width: 96, height: 40 },
      'fg-desk': { x: 0, y: 282, width: 640, height: 118 },
      'card-art-1': { x: 220, y: 345, width: 56, height: 44 },
      'card-art-2': { x: 292, y: 345, width: 56, height: 44 },
      'card-art-3': { x: 364, y: 345, width: 56, height: 44 },
      'ev-1': { x: 13, y: 363, width: 36, height: 36 },
      'ev-2': { x: 53, y: 363, width: 36, height: 36 },
      'ev-3': { x: 93, y: 363, width: 36, height: 36 },
      'icon-composure': { x: 190, y: 5, width: 16, height: 16 },
      'icon-coercion': { x: 372, y: 5, width: 16, height: 16 },
      partner: { x: 554, y: 302, width: 72, height: 88 },
    });
  });

  it('provides ordinary category_name_state.png download names', () => {
    for (const id of SLOT_IDS) {
      expect(canonicalDownloadName(id)).toMatch(/^[^_]+_.+_[^_]+[.]png$/u);
    }
    expect(PORTRAIT_PARTS_JSON_NAME).toBe('portrait_용의자.parts.json');
  });
});

describe('workbench PNG boundary', () => {
  it('accepts PNG extension plus PNG/empty MIME and rejects mismatches', () => {
    expect(validatePngDescriptor({ name: 'portrait.PNG', type: 'image/png' })).toEqual({
      ok: true,
    });
    expect(validatePngDescriptor({ name: 'legacy.png', type: '' })).toEqual({ ok: true });
    expect(validatePngDescriptor({ name: 'portrait.jpg', type: 'image/png' })).toMatchObject({
      ok: false,
    });
    expect(validatePngDescriptor({ name: 'portrait.png', type: 'image/jpeg' })).toMatchObject({
      ok: false,
    });
  });

  it('stores only PNG data URLs and removes images immutably', () => {
    const initial = createInitialWorkbenchState();
    const withImage = withSlotImage(initial, 'portrait-base', {
      dataUrl: PNG_DATA_URL,
      originalName: 'portrait.png',
    });

    expect(isPngDataUrl(PNG_DATA_URL)).toBe(true);
    expect(isPngDataUrl('data:image/jpeg;base64,AA==')).toBe(false);
    expect(withImage.images['portrait-base']).toEqual({
      dataUrl: PNG_DATA_URL,
      originalName: 'portrait.png',
    });
    expect(initial.images).toEqual({});
    expect(withoutSlotImage(withImage, 'portrait-base').images).toEqual({});
    expect(() =>
      withSlotImage(initial, 'portrait-base', {
        dataUrl: 'data:image/jpeg;base64,AA==',
        originalName: 'bad.jpg',
      }),
    ).toThrow(/Only PNG/u);
  });
});

describe('workbench geometry and portrait-parts export', () => {
  it('rounds and clamps every tweaked rectangle inside the stage', () => {
    expect(clampRect({ x: -8, y: 500, width: 999, height: 0 })).toEqual({
      x: 0,
      y: 399,
      width: 640,
      height: 1,
    });
    expect(clampRect({ x: 638.6, y: 398.6, width: 2.4, height: 2.4 })).toEqual({
      x: 638,
      y: 398,
      width: 2,
      height: 2,
    });
    expect(patchRect({ x: 10, y: 20, width: 30, height: 40 }, { x: -100 })).toEqual({
      x: 0,
      y: 20,
      width: 30,
      height: 40,
    });
    expect(nudgeRect({ x: 10, y: 20, width: 30, height: 40 }, 'width', 2.6)).toEqual({
      x: 10,
      y: 20,
      width: 33,
      height: 40,
    });
  });

  it('updates and resets one slot or the full geometry without mutating defaults', () => {
    const initial = createInitialWorkbenchState();
    const changed = withSlotRect(initial, 'ev-1', { x: 10, y: 10, width: 40, height: 40 });
    expect(changed.geometry['ev-1']).toEqual({ x: 10, y: 10, width: 40, height: 40 });
    expect(initial.geometry['ev-1']).toEqual({ x: 13, y: 363, width: 36, height: 36 });
    expect(resetSlotGeometry(changed, 'ev-1').geometry['ev-1']).toEqual(
      initial.geometry['ev-1'],
    );
    expect(resetAllGeometry(changed).geometry).toEqual(createDefaultGeometry());
  });

  it('clamps expression-part offsets to the portrait and exports relative and stage coordinates', () => {
    const initial = createInitialWorkbenchState();
    expect(getPartsOffset(initial.geometry)).toEqual({ x: 50, y: 44 });

    const adjusted = withPartsOffset(initial, 999, -20);
    expect(adjusted.geometry['portrait-parts']).toEqual({
      x: 322,
      y: 40,
      width: 96,
      height: 40,
    });
    expect(buildPortraitPartsManifest(adjusted.geometry)).toEqual({
      schema_version: '1.0',
      base: {
        slot: 'portrait-base',
        image: 'portrait_용의자_base.png',
      },
      parts: {
        slot: 'portrait-parts',
        image: 'portrait_용의자_parts.png',
        origin: 'portrait-base',
        x: 100,
        y: 0,
        width: 96,
        height: 40,
        stage_x: 322,
        stage_y: 40,
      },
    });
    const serialized = serializePortraitPartsManifest(adjusted.geometry);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(buildPortraitPartsManifest(adjusted.geometry));
  });
});

describe('workbench persistence normalization', () => {
  it('overlays valid known values on fresh defaults and drops untrusted fields', () => {
    const normalized = normalizeWorkbenchState({
      version: 999,
      geometry: {
        'portrait-base': { x: -10, y: 999, width: 999, height: 999 },
        'ev-1': { x: 22.4, y: 'bad', width: 20, height: 21 },
        unknown: { x: 1, y: 1, width: 1, height: 1 },
      },
      images: {
        'ev-1': { dataUrl: PNG_DATA_URL, originalName: 'evidence.png' },
        'ev-2': { dataUrl: 'data:image/jpeg;base64,AA==', originalName: 'bad.jpg' },
        unknown: { dataUrl: PNG_DATA_URL, originalName: 'unknown.png' },
      },
      predictsCorrectAnswer: true,
    });

    expect(normalized.version).toBe(WORKBENCH_STATE_VERSION);
    expect(normalized.geometry['portrait-base']).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 400,
    });
    expect(normalized.geometry['ev-1']).toEqual({
      x: 22,
      y: 363,
      width: 20,
      height: 21,
    });
    expect(normalized.images).toEqual({
      'ev-1': { dataUrl: PNG_DATA_URL, originalName: 'evidence.png' },
    });
    expect(normalized).not.toHaveProperty('predictsCorrectAnswer');
  });

  it('round-trips valid localStorage state and recovers from malformed JSON', () => {
    const storage = new MemoryStorage();
    const state = withSlotImage(createInitialWorkbenchState(), 'ev-3', {
      dataUrl: PNG_DATA_URL,
      originalName: 'third.png',
    });
    saveWorkbenchState(storage, state);

    expect(storage.values.has(WORKBENCH_STORAGE_KEY)).toBe(true);
    expect(loadWorkbenchState(storage)).toEqual(state);

    storage.values.set(WORKBENCH_STORAGE_KEY, '{broken');
    expect(loadWorkbenchState(storage)).toEqual(createInitialWorkbenchState());
  });
});
