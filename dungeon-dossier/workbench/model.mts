import {
  ASSET_DIMENSIONS,
  type AssetDimensionId,
} from '../src/ui/core/assetDimensions';
import {
  createAssetManifest,
  normalizeRotation,
  serializeAssetManifest as serializeManifestDocument,
  type AssetManifest,
  type AssetManifestSlot,
  type AssetTransform,
} from '../src/ui/core/assetManifest';

export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 400;

export const WORKBENCH_STORAGE_KEY = 'dungeon-dossier.asset-workbench.v2';
export const WORKBENCH_STATE_VERSION = 2;
export const PORTRAIT_PARTS_JSON_NAME = 'portrait_용의자.state-parts.json';
export const ASSET_MANIFEST_JSON_NAME = 'asset_manifest.json';
export const SUSPECT_STATE_PART_NAMES = ['upset', 'lose'] as const;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type WorkbenchDragMode = 'move' | 'rotate' | 'scale';

export interface WorkbenchDragInput {
  readonly mode: WorkbenchDragMode;
  readonly startPoint: Point;
  readonly currentPoint: Point;
  readonly startRect: Rect;
  readonly startRotation: number;
}

export const SLOT_IDS = [
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
] as const;

export type SlotId = (typeof SLOT_IDS)[number];

export interface SlotDefinition {
  readonly id: SlotId;
  readonly label: string;
  readonly description: string;
  readonly defaultRect: Rect;
  readonly layer: number;
  readonly downloadName: string;
  /** Authored PNG size this slot must be filled with. */
  readonly dimension: AssetDimensionId;
}

/**
 * The only asset slots in the planner workbench. Rectangles are the on-stage
 * placement in the 640x400 grid; every one keeps the aspect ratio of the
 * authored source size named by `dimension`.
 */
export const CANONICAL_SLOTS: readonly SlotDefinition[] = [
  {
    id: 'bg-room',
    label: '취조실 배경',
    description: '사전 베이크 팔레트 배경',
    defaultRect: { x: 0, y: 0, width: 640, height: 400 },
    layer: 0,
    downloadName: '배경_심문실_시안.png',
    dimension: 'bg_interrogation',
  },
  {
    id: 'suspect-base',
    label: '용의자 베이스',
    description: '책상 뒤 중앙 인물',
    defaultRect: { x: 212, y: 34, width: 216, height: 216 },
    layer: 10,
    downloadName: 'portrait_용의자_base.png',
    dimension: 'suspect_base',
  },
  {
    id: 'suspect-state-parts',
    label: '용의자 동요 파츠',
    description: 'upset 전신 오버레이',
    defaultRect: { x: 212, y: 34, width: 216, height: 216 },
    layer: 20,
    downloadName: 'portrait_용의자_upset.png',
    dimension: 'suspect_state_parts',
  },
  {
    id: 'suspect-lose-parts',
    label: '용의자 패배 파츠',
    description: 'lose 전신 오버레이',
    defaultRect: { x: 212, y: 34, width: 216, height: 216 },
    layer: 21,
    downloadName: 'portrait_용의자_lose.png',
    dimension: 'suspect_state_parts',
  },
  {
    id: 'fg-desk',
    label: '책상 전경',
    description: '투명 PNG 전경 레이어',
    defaultRect: { x: 0, y: 282, width: 640, height: 118 },
    layer: 30,
    downloadName: '전경_책상_기본.png',
    dimension: 'desk_foreground',
  },
  {
    id: 'card-base',
    label: '카드 베이스',
    description: '카드 최하단 템플릿 · 하단 20%만 노출',
    defaultRect: { x: 256, y: 371, width: 128, height: 145 },
    layer: 40,
    downloadName: 'card_기본_템플릿.png',
    dimension: 'card_base',
  },
  {
    id: 'card-art-1',
    label: '카드 일러스트 1',
    description: '질문 카드 예시',
    defaultRect: { x: 176, y: 336, width: 64, height: 64 },
    layer: 50,
    downloadName: 'card_질문_일러.png',
    dimension: 'card_illust',
  },
  {
    id: 'card-art-2',
    label: '카드 일러스트 2',
    description: '모순 카드 예시',
    defaultRect: { x: 248, y: 336, width: 64, height: 64 },
    layer: 50,
    downloadName: 'card_모순_일러.png',
    dimension: 'card_illust',
  },
  {
    id: 'card-art-3',
    label: '카드 일러스트 3',
    description: '압박 카드 예시',
    defaultRect: { x: 320, y: 336, width: 64, height: 64 },
    layer: 50,
    downloadName: 'card_압박_일러.png',
    dimension: 'card_illust',
  },
  {
    id: 'ev-1',
    label: '증거 1',
    description: '증거 주머니 첫 번째 칸',
    defaultRect: { x: 12, y: 306, width: 36, height: 36 },
    layer: 50,
    downloadName: 'ev_사건_증거1.png',
    dimension: 'evidence',
  },
  {
    id: 'ev-2',
    label: '증거 2',
    description: '증거 주머니 두 번째 칸',
    defaultRect: { x: 52, y: 306, width: 36, height: 36 },
    layer: 50,
    downloadName: 'ev_사건_증거2.png',
    dimension: 'evidence',
  },
  {
    id: 'ev-3',
    label: '증거 3',
    description: '증거 주머니 세 번째 칸',
    defaultRect: { x: 92, y: 306, width: 36, height: 36 },
    layer: 50,
    downloadName: 'ev_사건_증거3.png',
    dimension: 'evidence',
  },
  {
    id: 'icon-composure',
    label: '평정심 아이콘',
    description: '상단 HUD 16px 아이콘',
    defaultRect: { x: 139, y: 5, width: 16, height: 16 },
    layer: 60,
    downloadName: '아이콘_평정심_기본.png',
    dimension: 'icon_composure',
  },
  {
    id: 'icon-coercion',
    label: '강압 아이콘',
    description: '상단 HUD 16px 아이콘',
    defaultRect: { x: 326, y: 5, width: 16, height: 16 },
    layer: 60,
    downloadName: '아이콘_강압_기본.png',
    dimension: 'icon_coercion',
  },
  {
    id: 'partner-base',
    label: '파트너 · 활성',
    description: '김 인턴 능력 사용 가능',
    defaultRect: { x: 546, y: 296, width: 88, height: 88 },
    layer: 50,
    downloadName: 'portrait_김_인턴_base.png',
    dimension: 'partner',
  },
  {
    id: 'partner-used',
    label: '파트너 · 쿨다운',
    description: '김 인턴 능력 사용 후',
    defaultRect: { x: 546, y: 296, width: 88, height: 88 },
    layer: 50,
    downloadName: 'portrait_김_인턴_used.png',
    dimension: 'partner',
  },
] as const;

export interface SlotImageState {
  readonly dataUrl: string;
  readonly originalName: string;
}

export interface WorkbenchState {
  readonly version: typeof WORKBENCH_STATE_VERSION;
  readonly geometry: Readonly<Record<SlotId, Rect>>;
  /** Radians, normalized to [0, 2π). */
  readonly rotation: Readonly<Record<SlotId, number>>;
  readonly locks: Readonly<Record<SlotId, boolean>>;
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
}

/** LocalStorage keeps the same explicit transform fields as asset_manifest.json. */
export interface WorkbenchStorageDocument {
  readonly version: typeof WORKBENCH_STATE_VERSION;
  readonly transforms: Readonly<Record<SlotId, AssetTransform>>;
  readonly locks: Readonly<Record<SlotId, boolean>>;
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
}

export interface FileDescriptor {
  readonly name: string;
  readonly type: string;
}

export type PngValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

export interface PortraitStatePartEntry {
  readonly state: (typeof SUSPECT_STATE_PART_NAMES)[number];
  readonly slot: 'suspect-state-parts' | 'suspect-lose-parts';
  readonly image: string;
  readonly origin: 'suspect-base';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly stage_x: number;
  readonly stage_y: number;
}

export interface PortraitPartsManifest {
  readonly schema_version: '2.0';
  readonly base: Readonly<{
    slot: 'suspect-base';
    image: string;
    width: number;
    height: number;
  }>;
  readonly state_parts: readonly PortraitStatePartEntry[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SLOT_ID_SET: ReadonlySet<string> = new Set(SLOT_IDS);
const SLOT_DEFINITION_BY_ID: ReadonlyMap<SlotId, SlotDefinition> = new Map(
  CANONICAL_SLOTS.map((definition) => [definition.id, definition]),
);

function finiteInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finitePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

const FULL_TURN = Math.PI * 2;

function normalizeWorkbenchRotation(value: number): number {
  // Avoid feeding an already-normalized value through modulo repeatedly;
  // that can introduce a tiny floating-point drift on LocalStorage reload.
  return value >= 0 && value < FULL_TURN ? value : normalizeRotation(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSlotId(value: string): value is SlotId {
  return SLOT_ID_SET.has(value);
}

export function getSlotDefinition(id: SlotId): SlotDefinition {
  const definition = SLOT_DEFINITION_BY_ID.get(id);
  if (definition === undefined) {
    throw new Error(`Unknown workbench slot: ${id}`);
  }
  return definition;
}

export function getSlotSourceDimension(id: SlotId): Readonly<{ width: number; height: number }> {
  return ASSET_DIMENSIONS[getSlotDefinition(id).dimension];
}

function fromEntriesBySlot<T>(build: (definition: SlotDefinition) => T): Record<SlotId, T> {
  return Object.fromEntries(
    CANONICAL_SLOTS.map((definition) => [definition.id, build(definition)]),
  ) as Record<SlotId, T>;
}

export function createDefaultGeometry(): Record<SlotId, Rect> {
  return fromEntriesBySlot((definition) => ({ ...definition.defaultRect }));
}

export function createDefaultRotation(): Record<SlotId, number> {
  return fromEntriesBySlot(() => 0);
}

export function createDefaultLocks(): Record<SlotId, boolean> {
  return fromEntriesBySlot(() => false);
}

export function createInitialWorkbenchState(): WorkbenchState {
  return {
    version: WORKBENCH_STATE_VERSION,
    geometry: createDefaultGeometry(),
    rotation: createDefaultRotation(),
    locks: createDefaultLocks(),
    images: {},
  };
}

/**
 * Constrains a rectangle to integer pixels whose origin stays on the 640x400
 * stage. Width and height may run past the right or bottom edge because the
 * card hand is deliberately parked below the screen.
 */
export function clampRect(rect: Rect): Rect {
  const width = clamp(finiteInteger(rect.width, 1), 1, STAGE_WIDTH);
  const height = clamp(finiteInteger(rect.height, 1), 1, STAGE_HEIGHT);
  const x = clamp(finiteInteger(rect.x, 0), 0, STAGE_WIDTH - 1);
  const y = clamp(finiteInteger(rect.y, 0), 0, STAGE_HEIGHT - 1);
  return { x, y, width, height };
}

export function patchRect(rect: Rect, patch: Partial<Rect>): Rect {
  return clampRect({ ...rect, ...patch });
}

/**
 * Resizes a rotated rectangle from its visible bottom-right handle while the
 * opposite visible corner stays fixed. Pointer coordinates are in the same
 * 640x400 logical space as the rectangle.
 */
export function scaleRotatedRectFromHandle(
  rect: Rect,
  rotation: number,
  pointer: Point,
): Rect {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;

  // World-space position of the visible top-left corner (the fixed anchor).
  const anchorX = centreX - (rect.width / 2) * cosine + (rect.height / 2) * sine;
  const anchorY = centreY - (rect.width / 2) * sine - (rect.height / 2) * cosine;
  const deltaX = pointer.x - anchorX;
  const deltaY = pointer.y - anchorY;

  // Project the pointer into the rectangle's local axes before measuring it.
  const width = Math.max(1, deltaX * cosine + deltaY * sine);
  const height = Math.max(1, -deltaX * sine + deltaY * cosine);
  const resizedCentreX = anchorX + (width / 2) * cosine - (height / 2) * sine;
  const resizedCentreY = anchorY + (width / 2) * sine + (height / 2) * cosine;

  return clampRect({
    x: resizedCentreX - width / 2,
    y: resizedCentreY - height / 2,
    width,
    height,
  });
}

export function nudgeRect(
  rect: Rect,
  field: keyof Rect,
  delta: number,
): Rect {
  return patchRect(rect, { [field]: rect[field] + finiteInteger(delta, 0) });
}

export function isSlotLocked(state: WorkbenchState, id: SlotId): boolean {
  return state.locks[id];
}

/** A locked slot rejects every geometry change, which is what "확정" means. */
export function withSlotRect(
  state: WorkbenchState,
  id: SlotId,
  rect: Rect,
): WorkbenchState {
  if (isSlotLocked(state, id)) return state;
  return {
    ...state,
    geometry: {
      ...state.geometry,
      [id]: clampRect(rect),
    },
  };
}

export function withSlotRotation(
  state: WorkbenchState,
  id: SlotId,
  radians: number,
): WorkbenchState {
  if (isSlotLocked(state, id)) return state;
  return {
    ...state,
    rotation: {
      ...state.rotation,
      [id]: normalizeWorkbenchRotation(finiteNumber(radians, 0)),
    },
  };
}

/**
 * Scale is expressed against the authored source size, so a scale of 1 means
 * the slot is drawn at its full PNG resolution.
 */
export function withSlotScale(
  state: WorkbenchState,
  id: SlotId,
  scaleX: number,
  scaleY: number,
): WorkbenchState {
  if (isSlotLocked(state, id)) return state;
  const source = getSlotSourceDimension(id);
  const rect = state.geometry[id];
  return withSlotRect(state, id, {
    ...rect,
    width: Math.max(1, Math.round(source.width * Math.max(0, finiteNumber(scaleX, 1)))),
    height: Math.max(1, Math.round(source.height * Math.max(0, finiteNumber(scaleY, 1)))),
  });
}

export function getSlotScale(
  state: WorkbenchState,
  id: SlotId,
): Readonly<{ scaleX: number; scaleY: number }> {
  const source = getSlotSourceDimension(id);
  const rect = state.geometry[id];
  return { scaleX: rect.width / source.width, scaleY: rect.height / source.height };
}

/**
 * Pure transform used by the workbench pointer controller. Keeping all three
 * gizmo modes here makes the exact browser interaction contract reproducible
 * in the Node test suite, including the lock guard owned by the state reducers.
 */
export function applyWorkbenchDrag(
  state: WorkbenchState,
  id: SlotId,
  input: WorkbenchDragInput,
): WorkbenchState {
  if (input.mode === 'move') {
    return withSlotRect(state, id, {
      ...input.startRect,
      x: input.startRect.x + (input.currentPoint.x - input.startPoint.x),
      y: input.startRect.y + (input.currentPoint.y - input.startPoint.y),
    });
  }
  if (input.mode === 'rotate') {
    const centreX = input.startRect.x + input.startRect.width / 2;
    const centreY = input.startRect.y + input.startRect.height / 2;
    const startAngle = Math.atan2(
      input.startPoint.y - centreY,
      input.startPoint.x - centreX,
    );
    const currentAngle = Math.atan2(
      input.currentPoint.y - centreY,
      input.currentPoint.x - centreX,
    );
    return withSlotRotation(
      state,
      id,
      input.startRotation + (currentAngle - startAngle),
    );
  }
  return withSlotRect(
    state,
    id,
    scaleRotatedRectFromHandle(
      input.startRect,
      input.startRotation,
      input.currentPoint,
    ),
  );
}

export function withSlotLock(
  state: WorkbenchState,
  id: SlotId,
  locked: boolean,
): WorkbenchState {
  return { ...state, locks: { ...state.locks, [id]: locked } };
}

export function toggleSlotLock(state: WorkbenchState, id: SlotId): WorkbenchState {
  return withSlotLock(state, id, !isSlotLocked(state, id));
}

export function resetSlotGeometry(
  state: WorkbenchState,
  id: SlotId,
): WorkbenchState {
  if (isSlotLocked(state, id)) return state;
  return withSlotRotation(
    withSlotRect(state, id, getSlotDefinition(id).defaultRect),
    id,
    0,
  );
}

export function resetAllGeometry(state: WorkbenchState): WorkbenchState {
  const defaultGeometry = createDefaultGeometry();
  const defaultRotation = createDefaultRotation();
  const geometry = { ...state.geometry };
  const rotation = { ...state.rotation };
  for (const id of SLOT_IDS) {
    if (isSlotLocked(state, id)) continue;
    geometry[id] = defaultGeometry[id];
    rotation[id] = defaultRotation[id];
  }
  return { ...state, geometry, rotation };
}

export function withSlotImage(
  state: WorkbenchState,
  id: SlotId,
  image: SlotImageState,
): WorkbenchState {
  if (!isPngDataUrl(image.dataUrl)) {
    throw new Error('Only PNG data URLs can be stored in a workbench slot.');
  }
  return {
    ...state,
    images: {
      ...state.images,
      [id]: { ...image },
    },
  };
}

export function withoutSlotImage(
  state: WorkbenchState,
  id: SlotId,
): WorkbenchState {
  const images = { ...state.images };
  delete images[id];
  return { ...state, images };
}

export function validatePngDescriptor(file: FileDescriptor): PngValidationResult {
  if (!file.name.toLowerCase().endsWith('.png')) {
    return { ok: false, message: 'PNG 파일만 사용할 수 있습니다.' };
  }
  if (file.type !== '' && file.type.toLowerCase() !== 'image/png') {
    return { ok: false, message: '파일 형식이 image/png가 아닙니다.' };
  }
  return { ok: true };
}

/** Reads the PNG signature and IHDR width/height without decoding the image. */
export function parsePngHeaderDimensions(
  bytes: Uint8Array,
): Readonly<{ width: number; height: number }> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
  const ihdr = [0x49, 0x48, 0x44, 0x52] as const;
  const hasSignature = signature.every((value, index) => bytes[index] === value);
  const hasIhdr = ihdr.every((value, index) => bytes[index + 12] === value);
  if (bytes.byteLength < 24 || !hasSignature || !hasIhdr) {
    throw new Error('올바른 PNG 헤더를 읽지 못했습니다.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) {
    throw new Error('PNG 너비와 높이는 1px 이상이어야 합니다.');
  }
  return { width, height };
}

export function validateSlotImageDimensions(
  slotId: string,
  actual: Readonly<{ width: number; height: number }>,
): PngValidationResult {
  if (!isSlotId(slotId)) {
    return { ok: false, message: '알 수 없는 애셋 슬롯입니다.' };
  }
  const expected = getSlotSourceDimension(slotId);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return {
      ok: false,
      message: `${expected.width}×${expected.height}px PNG가 필요합니다. (선택: ${actual.width}×${actual.height}px)`,
    };
  }
  return { ok: true };
}

export function isPngDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/png;base64,/iu.test(value);
}

export function canonicalDownloadName(id: SlotId): string {
  return getSlotDefinition(id).downloadName;
}

export function getPartsOffset(
  geometry: Readonly<Record<SlotId, Rect>>,
): Readonly<{ x: number; y: number }> {
  const base = geometry['suspect-base'];
  const parts = geometry['suspect-state-parts'];
  return { x: parts.x - base.x, y: parts.y - base.y };
}

export function withPartsOffset(
  state: WorkbenchState,
  requestedX: number,
  requestedY: number,
): WorkbenchState {
  const base = state.geometry['suspect-base'];
  const parts = state.geometry['suspect-state-parts'];
  const maxX = Math.max(0, base.width - parts.width);
  const maxY = Math.max(0, base.height - parts.height);
  const x = clamp(finiteInteger(requestedX, 0), 0, maxX);
  const y = clamp(finiteInteger(requestedY, 0), 0, maxY);
  return withSlotRect(state, 'suspect-state-parts', {
    ...parts,
    x: base.x + x,
    y: base.y + y,
  });
}

const STATE_PART_SLOT_BY_NAME = {
  upset: 'suspect-state-parts',
  lose: 'suspect-lose-parts',
} as const satisfies Readonly<Record<(typeof SUSPECT_STATE_PART_NAMES)[number], SlotId>>;

export function buildPortraitPartsManifest(
  geometry: Readonly<Record<SlotId, Rect>>,
): PortraitPartsManifest {
  const base = geometry['suspect-base'];
  const source = ASSET_DIMENSIONS.suspect_state_parts;
  return {
    schema_version: '2.0',
    base: {
      slot: 'suspect-base',
      image: canonicalDownloadName('suspect-base'),
      width: ASSET_DIMENSIONS.suspect_base.width,
      height: ASSET_DIMENSIONS.suspect_base.height,
    },
    state_parts: SUSPECT_STATE_PART_NAMES.map((state) => {
      const slot = STATE_PART_SLOT_BY_NAME[state];
      const parts = geometry[slot];
      return {
        state,
        slot,
        image: canonicalDownloadName(slot),
        origin: 'suspect-base',
        x: parts.x - base.x,
        y: parts.y - base.y,
        width: source.width,
        height: source.height,
        stage_x: parts.x,
        stage_y: parts.y,
      };
    }),
  };
}

export function serializePortraitPartsManifest(
  geometry: Readonly<Record<SlotId, Rect>>,
): string {
  return `${JSON.stringify(buildPortraitPartsManifest(geometry), null, 2)}\n`;
}

export function buildSlotTransform(state: WorkbenchState, id: SlotId): AssetTransform {
  const rect = state.geometry[id];
  const scale = getSlotScale(state, id);
  return {
    x: rect.x,
    y: rect.y,
    rotation: state.rotation[id],
    scaleX: scale.scaleX,
    scaleY: scale.scaleY,
  };
}

export function buildAssetManifest(state: WorkbenchState): AssetManifest {
  const slots: Record<string, AssetManifestSlot> = {};
  for (const definition of CANONICAL_SLOTS) {
    slots[definition.id] = {
      dimension: definition.dimension,
      image:
        state.images[definition.id] === undefined
          ? null
          : canonicalDownloadName(definition.id),
      transform: buildSlotTransform(state, definition.id),
      isLocked: state.locks[definition.id],
    };
  }
  return createAssetManifest(slots);
}

export function serializeAssetManifest(state: WorkbenchState): string {
  return serializeManifestDocument(buildAssetManifest(state));
}

/**
 * Accepts untrusted JSON/localStorage data and overlays only valid known
 * slots onto fresh defaults. Unknown keys and malformed images are ignored.
 */
export function normalizeWorkbenchState(input: unknown): WorkbenchState {
  const initial = createInitialWorkbenchState();
  if (!isRecord(input)) return initial;

  const geometry = { ...initial.geometry };
  if (isRecord(input.geometry)) {
    for (const id of SLOT_IDS) {
      const rawRect = input.geometry[id];
      if (!isRecord(rawRect)) continue;
      const fallback = geometry[id];
      geometry[id] = clampRect({
        x: finiteInteger(rawRect.x, fallback.x),
        y: finiteInteger(rawRect.y, fallback.y),
        width: finiteInteger(rawRect.width, fallback.width),
        height: finiteInteger(rawRect.height, fallback.height),
      });
    }
  }

  const rotation = { ...initial.rotation };
  if (isRecord(input.rotation)) {
    for (const id of SLOT_IDS) {
      rotation[id] = normalizeWorkbenchRotation(finiteNumber(input.rotation[id], 0));
    }
  }

  // Read the renderer-facing transform envelope used by current LocalStorage.
  // geometry/rotation above remain supported as a migration path for older
  // workbench sessions.
  if (isRecord(input.transforms)) {
    for (const id of SLOT_IDS) {
      const transform = input.transforms[id];
      if (!isRecord(transform)) continue;
      const current = geometry[id];
      const source = getSlotSourceDimension(id);
      geometry[id] = clampRect({
        x: finiteNumber(transform.x, current.x),
        y: finiteNumber(transform.y, current.y),
        width:
          source.width *
          finitePositiveNumber(transform.scaleX, current.width / source.width),
        height:
          source.height *
          finitePositiveNumber(transform.scaleY, current.height / source.height),
      });
      rotation[id] = normalizeWorkbenchRotation(
        finiteNumber(transform.rotation, rotation[id]),
      );
    }
  }

  const locks = { ...initial.locks };
  if (isRecord(input.locks)) {
    for (const id of SLOT_IDS) {
      locks[id] = input.locks[id] === true;
    }
  }

  const images: Partial<Record<SlotId, SlotImageState>> = {};
  if (isRecord(input.images)) {
    for (const id of SLOT_IDS) {
      const rawImage = input.images[id];
      if (
        isRecord(rawImage) &&
        isPngDataUrl(rawImage.dataUrl) &&
        typeof rawImage.originalName === 'string'
      ) {
        images[id] = {
          dataUrl: rawImage.dataUrl,
          originalName: rawImage.originalName,
        };
      }
    }
  }

  return {
    version: WORKBENCH_STATE_VERSION,
    geometry,
    rotation,
    locks,
    images,
  };
}

export function serializeWorkbenchState(state: WorkbenchState): string {
  const normalized = normalizeWorkbenchState(state);
  const transforms = fromEntriesBySlot((definition) =>
    buildSlotTransform(normalized, definition.id),
  );
  const document: WorkbenchStorageDocument = {
    version: WORKBENCH_STATE_VERSION,
    transforms,
    locks: normalized.locks,
    images: normalized.images,
  };
  return JSON.stringify(document);
}

export function loadWorkbenchState(storage: StorageLike): WorkbenchState {
  const stored = storage.getItem(WORKBENCH_STORAGE_KEY);
  if (stored === null) return createInitialWorkbenchState();
  try {
    return normalizeWorkbenchState(JSON.parse(stored) as unknown);
  } catch {
    return createInitialWorkbenchState();
  }
}

export function saveWorkbenchState(
  storage: StorageLike,
  state: WorkbenchState,
): void {
  storage.setItem(WORKBENCH_STORAGE_KEY, serializeWorkbenchState(state));
}
