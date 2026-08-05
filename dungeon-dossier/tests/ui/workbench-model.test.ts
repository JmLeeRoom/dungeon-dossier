import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST_JSON_NAME,
  CANONICAL_SLOTS,
  PORTRAIT_PARTS_JSON_NAME,
  SLOT_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WORKBENCH_STATE_VERSION,
  WORKBENCH_STORAGE_KEY,
  buildAssetManifest,
  buildPortraitPartsManifest,
  buildSlotTransform,
  canonicalDownloadName,
  clampRect,
  createDefaultGeometry,
  createInitialWorkbenchState,
  getPartsOffset,
  getSlotScale,
  isPngDataUrl,
  isSlotLocked,
  loadWorkbenchState,
  normalizeWorkbenchState,
  nudgeRect,
  parsePngHeaderDimensions,
  patchRect,
  resetAllGeometry,
  resetSlotGeometry,
  saveWorkbenchState,
  scaleRotatedRectFromHandle,
  serializeAssetManifest,
  serializePortraitPartsManifest,
  serializeWorkbenchState,
  toggleSlotLock,
  validatePngDescriptor,
  validateSlotImageDimensions,
  withPartsOffset,
  withSlotImage,
  withSlotLock,
  withSlotRect,
  withSlotRotation,
  withSlotScale,
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
  it('defines exactly the sixteen measured slots in the 640x400 stage', () => {
    expect({ width: STAGE_WIDTH, height: STAGE_HEIGHT }).toEqual({
      width: 640,
      height: 400,
    });
    expect(SLOT_IDS).toEqual([
      'bg-room',
      'suspect-base',
      'suspect-state-parts',
      'suspect-lose-parts',
      'fg-desk',
      'card-base',
      'card-art-1',
      'card-art-2',
      'card-art-3',
      'ev-1',
      'ev-2',
      'ev-3',
      'icon-composure',
      'icon-coercion',
      'partner-base',
      'partner-used',
    ]);
    expect(CANONICAL_SLOTS).toHaveLength(16);
    expect(new Set(CANONICAL_SLOTS.map((slot) => slot.id)).size).toBe(16);

    expect(createDefaultGeometry()).toEqual({
      'bg-room': { x: 0, y: 0, width: 640, height: 400 },
      'suspect-base': { x: 212, y: 34, width: 216, height: 216 },
      'suspect-state-parts': { x: 212, y: 34, width: 216, height: 216 },
      'suspect-lose-parts': { x: 212, y: 34, width: 216, height: 216 },
      'fg-desk': { x: 0, y: 282, width: 640, height: 118 },
      'card-base': { x: 256, y: 371, width: 128, height: 145 },
      'card-art-1': { x: 176, y: 336, width: 64, height: 64 },
      'card-art-2': { x: 248, y: 336, width: 64, height: 64 },
      'card-art-3': { x: 320, y: 336, width: 64, height: 64 },
      'ev-1': { x: 12, y: 306, width: 36, height: 36 },
      'ev-2': { x: 52, y: 306, width: 36, height: 36 },
      'ev-3': { x: 92, y: 306, width: 36, height: 36 },
      'icon-composure': { x: 139, y: 5, width: 16, height: 16 },
      'icon-coercion': { x: 326, y: 5, width: 16, height: 16 },
      'partner-base': { x: 546, y: 296, width: 88, height: 88 },
      'partner-used': { x: 546, y: 296, width: 88, height: 88 },
    });
  });

  it('provides ordinary category_name_state.png download names', () => {
    for (const id of SLOT_IDS) {
      expect(canonicalDownloadName(id)).toMatch(/^[^_]+_.+_[^_]+[.]png$/u);
    }
    expect(PORTRAIT_PARTS_JSON_NAME).toBe('portrait_용의자.state-parts.json');
    expect(ASSET_MANIFEST_JSON_NAME).toBe('asset_manifest.json');
    expect(canonicalDownloadName('bg-room')).toBe('배경_심문실_시안.png');
    expect(canonicalDownloadName('fg-desk')).toBe('전경_책상_기본.png');
    expect(canonicalDownloadName('icon-composure')).toBe('아이콘_평정심_기본.png');
    expect(canonicalDownloadName('icon-coercion')).toBe('아이콘_강압_기본.png');
    expect(canonicalDownloadName('partner-base')).toBe('portrait_김_인턴_base.png');
    expect(canonicalDownloadName('partner-used')).toBe('portrait_김_인턴_used.png');
    expect(canonicalDownloadName('suspect-state-parts')).toBe('portrait_용의자_upset.png');
    expect(canonicalDownloadName('suspect-lose-parts')).toBe('portrait_용의자_lose.png');
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

  it('reads PNG IHDR dimensions and enforces the selected slot contract', () => {
    const header = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x03, 0x20,
    ]);

    expect(parsePngHeaderDimensions(header)).toEqual({ width: 1280, height: 800 });
    expect(validateSlotImageDimensions('bg-room', { width: 1280, height: 800 })).toEqual({
      ok: true,
    });
    const wrongSize = validateSlotImageDimensions('bg-room', { width: 16, height: 16 });
    expect(wrongSize.ok).toBe(false);
    if (!wrongSize.ok) expect(wrongSize.message).toContain('1280×800');
    expect(validateSlotImageDimensions('not-a-slot', { width: 1280, height: 800 })).toMatchObject({
      ok: false,
    });
    expect(() => parsePngHeaderDimensions(Uint8Array.from([0x89, 0x50]))).toThrow(/PNG/u);
  });

  it('stores only PNG data URLs and removes images immutably', () => {
    const initial = createInitialWorkbenchState();
    const withImage = withSlotImage(initial, 'suspect-base', {
      dataUrl: PNG_DATA_URL,
      originalName: 'portrait.png',
    });

    expect(isPngDataUrl(PNG_DATA_URL)).toBe(true);
    expect(isPngDataUrl('data:image/jpeg;base64,AA==')).toBe(false);
    expect(withImage.images['suspect-base']).toEqual({
      dataUrl: PNG_DATA_URL,
      originalName: 'portrait.png',
    });
    expect(initial.images).toEqual({});
    expect(withoutSlotImage(withImage, 'suspect-base').images).toEqual({});
    expect(() =>
      withSlotImage(initial, 'suspect-base', {
        dataUrl: 'data:image/jpeg;base64,AA==',
        originalName: 'bad.jpg',
      }),
    ).toThrow(/Only PNG/u);
  });
});

describe('workbench geometry and state-parts export', () => {
  it('rounds sizes and keeps every origin on the stage', () => {
    expect(clampRect({ x: -8, y: 500, width: 999, height: 0 })).toEqual({
      x: 0,
      y: 399,
      width: 640,
      height: 1,
    });
    expect(clampRect({ x: 638.6, y: 398.6, width: 2.4, height: 2.4 })).toEqual({
      x: 639,
      y: 399,
      width: 2,
      height: 2,
    });
    // The card hand deliberately hangs off the bottom edge.
    expect(clampRect({ x: 256, y: 371, width: 128, height: 145 })).toEqual({
      x: 256,
      y: 371,
      width: 128,
      height: 145,
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
    expect(initial.geometry['ev-1']).toEqual({ x: 12, y: 306, width: 36, height: 36 });
    expect(resetSlotGeometry(changed, 'ev-1').geometry['ev-1']).toEqual(
      initial.geometry['ev-1'],
    );
    expect(resetAllGeometry(changed).geometry).toEqual(createDefaultGeometry());
  });

  it('clamps state-part offsets to the portrait and exports both state sheets', () => {
    const initial = createInitialWorkbenchState();
    expect(getPartsOffset(initial.geometry)).toEqual({ x: 0, y: 0 });

    // The overlay shares the base frame, so no offset can move it away.
    const adjusted = withPartsOffset(initial, 999, -20);
    expect(adjusted.geometry['suspect-state-parts']).toEqual({
      x: 212,
      y: 34,
      width: 216,
      height: 216,
    });
    expect(buildPortraitPartsManifest(adjusted.geometry)).toEqual({
      schema_version: '2.0',
      base: {
        slot: 'suspect-base',
        image: 'portrait_용의자_base.png',
        width: 512,
        height: 512,
      },
      state_parts: [
        {
          state: 'upset',
          slot: 'suspect-state-parts',
          image: 'portrait_용의자_upset.png',
          origin: 'suspect-base',
          x: 0,
          y: 0,
          width: 512,
          height: 512,
          stage_x: 212,
          stage_y: 34,
        },
        {
          state: 'lose',
          slot: 'suspect-lose-parts',
          image: 'portrait_용의자_lose.png',
          origin: 'suspect-base',
          x: 0,
          y: 0,
          width: 512,
          height: 512,
          stage_x: 212,
          stage_y: 34,
        },
      ],
    });
    const serialized = serializePortraitPartsManifest(adjusted.geometry);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(buildPortraitPartsManifest(adjusted.geometry));
  });
});

describe('workbench transform controller', () => {
  it('scales along rotated local axes while keeping the opposite corner fixed', () => {
    const rect = { x: 100, y: 100, width: 80, height: 40 };

    // At 90 degrees, the visible bottom-right handle is at (120, 160).
    expect(scaleRotatedRectFromHandle(rect, Math.PI / 2, { x: 120, y: 160 })).toEqual(rect);
    expect(scaleRotatedRectFromHandle(rect, Math.PI / 2, { x: 120, y: 170 })).toEqual({
      x: 95,
      y: 105,
      width: 90,
      height: 40,
    });

    expect(scaleRotatedRectFromHandle(rect, 0, { x: 190, y: 145 })).toEqual({
      x: 100,
      y: 100,
      width: 90,
      height: 45,
    });
  });

  it('normalizes rotation and derives scale from the authored source size', () => {
    const rotated = withSlotRotation(createInitialWorkbenchState(), 'ev-1', -Math.PI / 2);
    expect(rotated.rotation['ev-1']).toBeCloseTo((3 * Math.PI) / 2, 10);
    expect(rotated.rotation['ev-2']).toBe(0);

    const initial = createInitialWorkbenchState();
    expect(getSlotScale(initial, 'ev-1')).toEqual({ scaleX: 36 / 128, scaleY: 36 / 128 });
    const scaled = withSlotScale(initial, 'ev-1', 0.5, 0.25);
    expect(scaled.geometry['ev-1']).toEqual({ x: 12, y: 306, width: 64, height: 32 });
    expect(buildSlotTransform(scaled, 'ev-1')).toEqual({
      x: 12,
      y: 306,
      rotation: 0,
      scaleX: 0.5,
      scaleY: 0.25,
    });
  });

  it('blocks every geometry change once a slot is locked', () => {
    const locked = withSlotLock(createInitialWorkbenchState(), 'bg-room', true);
    expect(isSlotLocked(locked, 'bg-room')).toBe(true);
    expect(isSlotLocked(locked, 'ev-1')).toBe(false);

    expect(withSlotRect(locked, 'bg-room', { x: 5, y: 5, width: 40, height: 25 })).toBe(locked);
    expect(withSlotRotation(locked, 'bg-room', 1)).toBe(locked);
    expect(withSlotScale(locked, 'bg-room', 0.25, 0.25)).toBe(locked);
    expect(resetSlotGeometry(locked, 'bg-room')).toBe(locked);
    expect(withSlotRect(locked, 'ev-1', { x: 5, y: 5, width: 40, height: 40 })).not.toBe(locked);

    const unlocked = toggleSlotLock(locked, 'bg-room');
    expect(isSlotLocked(unlocked, 'bg-room')).toBe(false);
    expect(withSlotRotation(unlocked, 'bg-room', 1).rotation['bg-room']).toBe(1);

    // Images can still be attached to a locked slot; only placement is frozen.
    expect(
      withSlotImage(locked, 'bg-room', { dataUrl: PNG_DATA_URL, originalName: 'bg.png' })
        .images['bg-room'],
    ).toBeDefined();

    const movedThenLocked = withSlotLock(
      withSlotRect(createInitialWorkbenchState(), 'bg-room', {
        x: 4,
        y: 6,
        width: 320,
        height: 200,
      }),
      'bg-room',
      true,
    );
    expect(resetAllGeometry(movedThenLocked).geometry['bg-room']).toEqual({
      x: 4,
      y: 6,
      width: 320,
      height: 200,
    });
  });

  it('exports a lockable manifest entry for every slot', () => {
    const state = withSlotLock(
      withSlotRotation(createInitialWorkbenchState(), 'card-base', Math.PI / 4),
      'card-base',
      true,
    );
    const manifest = buildAssetManifest(state);

    expect(manifest.slots['card-base']).toEqual({
      dimension: 'card_base',
      image: null,
      transform: { x: 256, y: 371, rotation: Math.PI / 4, scaleX: 0.2, scaleY: 0.2 },
      isLocked: true,
    });
    expect(manifest.slots['partner-used']?.dimension).toBe('partner');
    expect(JSON.parse(serializeAssetManifest(state))).toEqual(manifest);

    const filled = buildAssetManifest(
      withSlotImage(state, 'card-base', {
        dataUrl: PNG_DATA_URL,
        originalName: 'planner-draft.png',
      }),
    );
    expect(filled.slots['card-base']?.image).toBe(canonicalDownloadName('card-base'));
  });
});

describe('workbench persistence normalization', () => {
  it('overlays valid known values on fresh defaults and drops untrusted fields', () => {
    const normalized = normalizeWorkbenchState({
      version: 999,
      geometry: {
        'suspect-base': { x: -10, y: 999, width: 999, height: 999 },
        'ev-1': { x: 22.4, y: 'bad', width: 20, height: 21 },
        unknown: { x: 1, y: 1, width: 1, height: 1 },
      },
      rotation: { 'ev-1': Math.PI * 3, 'ev-2': 'bad', unknown: 1 },
      locks: { 'ev-1': true, 'ev-2': 'yes', unknown: true },
      images: {
        'ev-1': { dataUrl: PNG_DATA_URL, originalName: 'evidence.png' },
        'ev-2': { dataUrl: 'data:image/jpeg;base64,AA==', originalName: 'bad.jpg' },
        unknown: { dataUrl: PNG_DATA_URL, originalName: 'unknown.png' },
      },
      predictsCorrectAnswer: true,
    });

    expect(normalized.version).toBe(WORKBENCH_STATE_VERSION);
    expect(normalized.geometry['suspect-base']).toEqual({
      x: 0,
      y: 399,
      width: 640,
      height: 400,
    });
    expect(normalized.geometry['ev-1']).toEqual({
      x: 22,
      y: 306,
      width: 20,
      height: 21,
    });
    expect(normalized.rotation['ev-1']).toBeCloseTo(Math.PI, 10);
    expect(normalized.rotation['ev-2']).toBe(0);
    expect(normalized.locks['ev-1']).toBe(true);
    expect(normalized.locks['ev-2']).toBe(false);
    expect(normalized.images).toEqual({
      'ev-1': { dataUrl: PNG_DATA_URL, originalName: 'evidence.png' },
    });
    expect(normalized).not.toHaveProperty('predictsCorrectAnswer');
  });

  it('round-trips valid localStorage state and recovers from malformed JSON', () => {
    const storage = new MemoryStorage();
    const state = withSlotLock(
      withSlotScale(
        withSlotRotation(
          withSlotImage(createInitialWorkbenchState(), 'ev-3', {
            dataUrl: PNG_DATA_URL,
            originalName: 'third.png',
          }),
          'ev-3',
          Math.PI / 3,
        ),
        'ev-3',
        0.5,
        0.25,
      ),
      'ev-3',
      true,
    );
    saveWorkbenchState(storage, state);

    expect(storage.values.has(WORKBENCH_STORAGE_KEY)).toBe(true);
    const persisted = JSON.parse(serializeWorkbenchState(state)) as {
      transforms: Record<string, unknown>;
      locks: Record<string, boolean>;
    };
    expect(persisted.transforms['ev-3']).toEqual({
      x: 92,
      y: 306,
      rotation: Math.PI / 3,
      scaleX: 0.5,
      scaleY: 0.25,
    });
    expect(persisted.locks['ev-3']).toBe(true);
    expect(persisted).not.toHaveProperty('geometry');
    expect(loadWorkbenchState(storage)).toEqual(state);

    storage.values.set(WORKBENCH_STORAGE_KEY, '{broken');
    expect(loadWorkbenchState(storage)).toEqual(createInitialWorkbenchState());
  });
});
