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

/**
 * The storage slot, not the document version: bumping this would strand every
 * planner's saved layout, so migrations key off the document's own `version`.
 */
export const WORKBENCH_STORAGE_KEY = 'dungeon-dossier.asset-workbench.v2';
export const WORKBENCH_STATE_VERSION = 3;
export const PORTRAIT_PARTS_JSON_NAME = 'portrait_용의자.state-parts.json';
export const ASSET_MANIFEST_JSON_NAME = 'asset_manifest.json';
export const SUSPECT_STATE_PART_NAMES = ['upset', 'lose'] as const;

/** Every portrait checked into `assets/portraits/`. */
export const WORKBENCH_CHARACTERS = [
  '물컹이',
  '하피',
  '미노타우로스',
  '고블린',
  '오크',
  '서큐버스',
  '드워프',
  '사이클롭스',
  '켄타우로스',
  '타락한_용사',
  '김태훈',
  '김_인턴',
] as const;
export type WorkbenchCharacter = (typeof WORKBENCH_CHARACTERS)[number];

export const DEFAULT_WORKBENCH_CHARACTER: WorkbenchCharacter = '물컹이';
/** The only character with a fourth sheet: the partner's cooldown portrait. */
export const PARTNER_CHARACTER: WorkbenchCharacter = '김_인턴';

export const CHARACTER_PART_NAMES = ['base', 'upset', 'lose', 'used'] as const;
export type CharacterPartName = (typeof CHARACTER_PART_NAMES)[number];

const SHARED_CHARACTER_PART_NAMES: readonly CharacterPartName[] = ['base', 'upset', 'lose'];

/**
 * Offsets are authored-space pixels against a 512x512 base, exactly as the
 * sidecar stores them. One base frame in any direction is the useful range.
 */
export const CHARACTER_PART_OFFSET_LIMIT = ASSET_DIMENSIONS.suspect_base.width;

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
  /**
   * Omit (or set true) to keep the authored aspect ratio locked. Set false for
   * slots whose stage rect deliberately deviates, such as the 1280x321 desk
   * plate that cannot land on an integer height in the 640x400 grid.
   */
  readonly preserveAspectRatio?: boolean;
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
    description: '투명 PNG 전경 레이어 · 1280×321 저작, 640×161 배치(의도적 절상)',
    defaultRect: { x: 0, y: 239, width: 640, height: 161 },
    layer: 30,
    downloadName: '전경_책상_기본.png',
    dimension: 'desk_foreground',
    // 321 / 2 = 160.5. Rounding down would leave a 1px gap at the stage floor,
    // so the plate is placed at 161 and its aspect lock is released.
    preserveAspectRatio: false,
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

/** One character's portrait sheets and their offsets against the base frame. */
export interface CharacterPartsState {
  readonly images: Readonly<Partial<Record<CharacterPartName, SlotImageState>>>;
  readonly offsets: Readonly<Partial<Record<CharacterPartName, Point>>>;
}

export interface WorkbenchState {
  readonly version: typeof WORKBENCH_STATE_VERSION;
  readonly geometry: Readonly<Record<SlotId, Rect>>;
  /** Radians, normalized to [0, 2π). */
  readonly rotation: Readonly<Record<SlotId, number>>;
  readonly locks: Readonly<Record<SlotId, boolean>>;
  /** False lets a slot be resized off its authored aspect ratio on purpose. */
  readonly aspectLocks: Readonly<Record<SlotId, boolean>>;
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
  readonly activeCharacter: WorkbenchCharacter;
  readonly characters: Readonly<Record<WorkbenchCharacter, CharacterPartsState>>;
}

/** LocalStorage keeps the same explicit transform fields as asset_manifest.json. */
export interface WorkbenchStorageDocument {
  readonly version: typeof WORKBENCH_STATE_VERSION;
  readonly transforms: Readonly<Record<SlotId, AssetTransform>>;
  readonly locks: Readonly<Record<SlotId, boolean>>;
  readonly aspectLocks: Readonly<Record<SlotId, boolean>>;
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
  readonly activeCharacter: WorkbenchCharacter;
  readonly characters: Readonly<Record<WorkbenchCharacter, CharacterPartsState>>;
}

/**
 * The interchange shape actually checked into `assets/portraits/`. Both state
 * parts declare the `suspect-state-parts` slot and there are no stage fields,
 * so a workbench export diffs clean against a generated sidecar.
 */
export interface CharacterStatePartEntry {
  readonly state: (typeof SUSPECT_STATE_PART_NAMES)[number];
  readonly slot: 'suspect-state-parts';
  readonly image: string;
  readonly origin: 'suspect-base';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CharacterPartsManifest {
  readonly schema_version: '2.0';
  readonly base: Readonly<{
    slot: 'suspect-base';
    image: string;
    width: number;
    height: number;
  }>;
  readonly state_parts: readonly CharacterStatePartEntry[];
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

/** Aspect stays locked unless the slot catalogue opts out (see `fg-desk`). */
export function createDefaultAspectLocks(): Record<SlotId, boolean> {
  return fromEntriesBySlot((definition) => definition.preserveAspectRatio !== false);
}

export function createDefaultCharacters(): Record<WorkbenchCharacter, CharacterPartsState> {
  return Object.fromEntries(
    WORKBENCH_CHARACTERS.map((character) => [character, { images: {}, offsets: {} }]),
  ) as Record<WorkbenchCharacter, CharacterPartsState>;
}

export function createInitialWorkbenchState(): WorkbenchState {
  return {
    version: WORKBENCH_STATE_VERSION,
    geometry: createDefaultGeometry(),
    rotation: createDefaultRotation(),
    locks: createDefaultLocks(),
    aspectLocks: createDefaultAspectLocks(),
    images: {},
    activeCharacter: DEFAULT_WORKBENCH_CHARACTER,
    characters: createDefaultCharacters(),
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
  const scaled = scaleRotatedRectFromHandle(
    input.startRect,
    input.startRotation,
    input.currentPoint,
  );
  if (!state.aspectLocks[id]) return withSlotRect(state, id, scaled);
  // A locked slot follows whichever edge the planner pulled furthest, so a corner
  // drag still feels direct while the authored ratio survives.
  const source = getSlotSourceDimension(id);
  const aspect = source.width / source.height;
  const widthDelta = Math.abs(scaled.width - input.startRect.width);
  const heightDelta = Math.abs(scaled.height - input.startRect.height);
  const width = widthDelta >= heightDelta
    ? scaled.width
    : Math.max(1, Math.round(scaled.height * aspect));
  const height = widthDelta >= heightDelta
    ? Math.max(1, Math.round(scaled.width / aspect))
    : scaled.height;
  return withSlotRect(state, id, { ...scaled, width, height });
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

const CHARACTER_SET: ReadonlySet<string> = new Set(WORKBENCH_CHARACTERS);
const CHARACTER_PART_SET: ReadonlySet<string> = new Set(CHARACTER_PART_NAMES);

export function isWorkbenchCharacter(value: string): value is WorkbenchCharacter {
  return CHARACTER_SET.has(value);
}

export function isCharacterPartName(value: string): value is CharacterPartName {
  return CHARACTER_PART_SET.has(value);
}

/** `used` exists only for the partner; every other character has three sheets. */
export function characterPartNames(
  character: WorkbenchCharacter,
): readonly CharacterPartName[] {
  return character === PARTNER_CHARACTER
    ? [...SHARED_CHARACTER_PART_NAMES, 'used']
    : SHARED_CHARACTER_PART_NAMES;
}

export function hasCharacterPart(
  character: WorkbenchCharacter,
  part: CharacterPartName,
): boolean {
  return characterPartNames(character).includes(part);
}

/**
 * Only the two sidecar state parts have an offset. `base` is the origin they
 * are measured from, and the partner's `used` sheet is placed by its stage
 * slot, so neither would survive an export round trip.
 */
export function characterPartHasOffset(part: CharacterPartName): boolean {
  return (SUSPECT_STATE_PART_NAMES as readonly string[]).includes(part);
}

/**
 * Which canonical stage slot a character part borrows for its PNG contract.
 * Reusing the slot ids keeps one dimension check and one download name for
 * both the stage preview and the character panel.
 */
const CHARACTER_PART_SLOT_IDS = {
  base: 'suspect-base',
  upset: 'suspect-state-parts',
  lose: 'suspect-lose-parts',
  used: 'partner-used',
} as const satisfies Readonly<Record<CharacterPartName, SlotId>>;

export function characterPartSlotId(part: CharacterPartName): SlotId {
  return CHARACTER_PART_SLOT_IDS[part];
}

export interface SlotCharacterBinding {
  readonly part: CharacterPartName;
  /** Absent means the binding follows whichever character is selected. */
  readonly character?: WorkbenchCharacter;
}

/**
 * The stage slots that show a character rather than a standalone asset. The
 * partner pair is pinned because those two sheets are always the partner's,
 * whatever the planner is currently editing.
 */
export const SLOT_CHARACTER_BINDINGS: Readonly<
  Partial<Record<SlotId, SlotCharacterBinding>>
> = {
  'suspect-base': { part: 'base' },
  'suspect-state-parts': { part: 'upset' },
  'suspect-lose-parts': { part: 'lose' },
  'partner-base': { part: 'base', character: PARTNER_CHARACTER },
  'partner-used': { part: 'used', character: PARTNER_CHARACTER },
};

export function resolveSlotBinding(
  state: WorkbenchState,
  id: SlotId,
): Readonly<{ character: WorkbenchCharacter; part: CharacterPartName }> | undefined {
  const binding = SLOT_CHARACTER_BINDINGS[id];
  if (binding === undefined) return undefined;
  return {
    character: binding.character ?? state.activeCharacter,
    part: binding.part,
  };
}

export function getCharacterPartImage(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  part: CharacterPartName,
): SlotImageState | undefined {
  return state.characters[character].images[part];
}

export function getCharacterPartOffset(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  part: CharacterPartName,
): Point {
  return state.characters[character].offsets[part] ?? { x: 0, y: 0 };
}

function withCharacterParts(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  parts: CharacterPartsState,
): WorkbenchState {
  return { ...state, characters: { ...state.characters, [character]: parts } };
}

export function withActiveCharacter(
  state: WorkbenchState,
  character: WorkbenchCharacter,
): WorkbenchState {
  if (state.activeCharacter === character) return state;
  return { ...state, activeCharacter: character };
}

export function withCharacterPartImage(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  part: CharacterPartName,
  image: SlotImageState,
): WorkbenchState {
  if (!isPngDataUrl(image.dataUrl)) {
    throw new Error('Only PNG data URLs can be stored in a workbench slot.');
  }
  if (!hasCharacterPart(character, part)) return state;
  const current = state.characters[character];
  return withCharacterParts(state, character, {
    ...current,
    images: { ...current.images, [part]: { ...image } },
  });
}

export function withoutCharacterPartImage(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  part: CharacterPartName,
): WorkbenchState {
  const current = state.characters[character];
  if (current.images[part] === undefined) return state;
  const images = { ...current.images };
  delete images[part];
  return withCharacterParts(state, character, { ...current, images });
}

export function withCharacterPartOffset(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  part: CharacterPartName,
  requestedX: number,
  requestedY: number,
): WorkbenchState {
  if (!hasCharacterPart(character, part) || !characterPartHasOffset(part)) return state;
  const limit = CHARACTER_PART_OFFSET_LIMIT;
  const offset = {
    x: clamp(finiteInteger(requestedX, 0), -limit, limit),
    y: clamp(finiteInteger(requestedY, 0), -limit, limit),
  };
  const current = state.characters[character];
  return withCharacterParts(state, character, {
    ...current,
    offsets: { ...current.offsets, [part]: offset },
  });
}

/** Binding-aware read used by both the stage preview and the asset manifest. */
export function resolveStageSlotImage(
  state: WorkbenchState,
  id: SlotId,
): SlotImageState | undefined {
  const binding = resolveSlotBinding(state, id);
  if (binding === undefined) return state.images[id];
  return getCharacterPartImage(state, binding.character, binding.part) ?? state.images[id];
}

/** Binding-aware write: dropping a PNG on a bound slot edits that character. */
export function withStageSlotImage(
  state: WorkbenchState,
  id: SlotId,
  image: SlotImageState,
): WorkbenchState {
  const binding = resolveSlotBinding(state, id);
  return binding === undefined
    ? withSlotImage(state, id, image)
    : withCharacterPartImage(state, binding.character, binding.part, image);
}

export function withoutStageSlotImage(state: WorkbenchState, id: SlotId): WorkbenchState {
  const binding = resolveSlotBinding(state, id);
  return binding === undefined
    ? withoutSlotImage(state, id)
    : withoutCharacterPartImage(state, binding.character, binding.part);
}

export function characterPartFileName(
  character: WorkbenchCharacter,
  part: CharacterPartName,
): string {
  return `portrait_${character}_${part}.png`;
}

export function characterPartsJsonName(character: WorkbenchCharacter): string {
  return `portrait_${character}.state-parts.json`;
}

export function buildCharacterPartsManifest(
  state: WorkbenchState,
  character: WorkbenchCharacter,
): CharacterPartsManifest {
  const source = ASSET_DIMENSIONS.suspect_state_parts;
  return {
    schema_version: '2.0',
    base: {
      slot: 'suspect-base',
      image: characterPartFileName(character, 'base'),
      width: ASSET_DIMENSIONS.suspect_base.width,
      height: ASSET_DIMENSIONS.suspect_base.height,
    },
    state_parts: SUSPECT_STATE_PART_NAMES.map((part) => {
      const offset = getCharacterPartOffset(state, character, part);
      return {
        state: part,
        slot: 'suspect-state-parts',
        image: characterPartFileName(character, part),
        origin: 'suspect-base',
        x: offset.x,
        y: offset.y,
        width: source.width,
        height: source.height,
      };
    }),
  };
}

export function serializeCharacterPartsManifest(
  state: WorkbenchState,
  character: WorkbenchCharacter,
): string {
  return `${JSON.stringify(buildCharacterPartsManifest(state, character), null, 2)}\n`;
}

/** Reads `portrait_<name>_base.png` back into the character it belongs to. */
export function characterFromPartsManifest(input: unknown): WorkbenchCharacter | undefined {
  if (!isRecord(input) || !isRecord(input.base)) return undefined;
  const image = input.base.image;
  if (typeof image !== 'string') return undefined;
  const match = /^portrait_(?<name>.+)_base\.png$/u.exec(image);
  const name = match?.groups?.['name'];
  return name !== undefined && isWorkbenchCharacter(name) ? name : undefined;
}

/**
 * Folds a checked-in sidecar back into editable state. Images are not carried:
 * the JSON only names its PNGs, which the planner drops separately.
 */
export function withImportedCharacterParts(
  state: WorkbenchState,
  character: WorkbenchCharacter,
  input: unknown,
): WorkbenchState {
  if (!isRecord(input) || input.schema_version !== '2.0') {
    throw new Error('schema_version 2.0 사이드카 JSON만 가져올 수 있습니다.');
  }
  const entries = input.state_parts;
  if (!Array.isArray(entries)) {
    throw new Error('state_parts 배열을 찾지 못했습니다.');
  }
  let next = state;
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const part = entry.state;
    if (typeof part !== 'string' || !isCharacterPartName(part)) continue;
    const current = getCharacterPartOffset(next, character, part);
    next = withCharacterPartOffset(
      next,
      character,
      part,
      finiteInteger(entry.x, current.x),
      finiteInteger(entry.y, current.y),
    );
  }
  return next;
}

export function buildSlotTransform(state: WorkbenchState, id: SlotId): AssetTransform {
  const rect = state.geometry[id];
  const scale = getSlotScale(state, id);
  const preserveAspectRatio = state.aspectLocks[id];
  return {
    x: rect.x,
    y: rect.y,
    rotation: state.rotation[id],
    scaleX: scale.scaleX,
    scaleY: scale.scaleY,
    preserveAspectRatio,
    // An unlocked slot records its exact on-stage rect so the renderer never has
    // to reconstruct a distorted size from two independently rounded scales.
    ...(preserveAspectRatio
      ? {}
      : { customWidth: rect.width, customHeight: rect.height }),
  };
}

export function setSlotAspectLock(
  state: WorkbenchState,
  id: SlotId,
  preserveAspectRatio: boolean,
): WorkbenchState {
  return { ...state, aspectLocks: { ...state.aspectLocks, [id]: preserveAspectRatio } };
}

/**
 * Resizes a slot to an explicit on-stage size. A locked slot derives the missing
 * edge from its authored aspect ratio, so callers may pass either edge alone.
 */
export function setSlotSize(
  state: WorkbenchState,
  id: SlotId,
  size: Readonly<{ width?: number; height?: number }>,
): WorkbenchState {
  const rect = state.geometry[id];
  const source = getSlotSourceDimension(id);
  const aspect = source.width / source.height;
  const requestedWidth = finitePositiveNumber(size.width, rect.width);
  const requestedHeight = finitePositiveNumber(size.height, rect.height);
  const locked = state.aspectLocks[id];
  const width = locked && size.width === undefined
    ? Math.max(1, Math.round(requestedHeight * aspect))
    : Math.max(1, Math.round(requestedWidth));
  const height = locked && size.width !== undefined
    ? Math.max(1, Math.round(requestedWidth / aspect))
    : Math.max(1, Math.round(requestedHeight));
  return {
    ...state,
    geometry: { ...state.geometry, [id]: { ...rect, width, height } },
  };
}

export function buildAssetManifest(state: WorkbenchState): AssetManifest {
  const slots: Record<string, AssetManifestSlot> = {};
  for (const definition of CANONICAL_SLOTS) {
    const binding = resolveSlotBinding(state, definition.id);
    slots[definition.id] = {
      dimension: definition.dimension,
      image:
        resolveStageSlotImage(state, definition.id) === undefined
          ? null
          : binding === undefined
            ? canonicalDownloadName(definition.id)
            : characterPartFileName(binding.character, binding.part),
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

  // Absent in v2 documents; the catalogue default reproduces their geometry.
  const aspectLocks = createDefaultAspectLocks();
  if (isRecord(input.aspectLocks)) {
    for (const id of SLOT_IDS) {
      const stored = input.aspectLocks[id];
      if (typeof stored === 'boolean') aspectLocks[id] = stored;
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

  const activeCharacter =
    typeof input.activeCharacter === 'string' && isWorkbenchCharacter(input.activeCharacter)
      ? input.activeCharacter
      : DEFAULT_WORKBENCH_CHARACTER;

  const characters = createDefaultCharacters();
  if (isRecord(input.characters)) {
    for (const character of WORKBENCH_CHARACTERS) {
      const raw = input.characters[character];
      if (!isRecord(raw)) continue;
      characters[character] = {
        images: readPartImages(raw.images, character),
        offsets: readPartOffsets(raw.offsets, character),
      };
    }
  }

  const migrated = migrateSuspectSlotsToCharacter(
    input,
    { geometry, images },
    characters,
    activeCharacter,
  );

  return {
    version: WORKBENCH_STATE_VERSION,
    geometry,
    rotation,
    locks,
    aspectLocks,
    images: migrated.images,
    activeCharacter,
    characters: migrated.characters,
  };
}

function readPartImages(
  input: unknown,
  character: WorkbenchCharacter,
): Partial<Record<CharacterPartName, SlotImageState>> {
  const images: Partial<Record<CharacterPartName, SlotImageState>> = {};
  if (!isRecord(input)) return images;
  for (const part of characterPartNames(character)) {
    const raw = input[part];
    if (
      isRecord(raw) &&
      isPngDataUrl(raw.dataUrl) &&
      typeof raw.originalName === 'string'
    ) {
      images[part] = { dataUrl: raw.dataUrl, originalName: raw.originalName };
    }
  }
  return images;
}

function readPartOffsets(
  input: unknown,
  character: WorkbenchCharacter,
): Partial<Record<CharacterPartName, Point>> {
  const offsets: Partial<Record<CharacterPartName, Point>> = {};
  if (!isRecord(input)) return offsets;
  const limit = CHARACTER_PART_OFFSET_LIMIT;
  for (const part of characterPartNames(character)) {
    if (!characterPartHasOffset(part)) continue;
    const raw = input[part];
    if (!isRecord(raw)) continue;
    offsets[part] = {
      x: clamp(finiteInteger(raw.x, 0), -limit, limit),
      y: clamp(finiteInteger(raw.y, 0), -limit, limit),
    };
  }
  return offsets;
}

/**
 * v2 held one anonymous suspect in the stage slots. Its sheets and its
 * state-part offset become the default character so an existing planner's work
 * survives the upgrade instead of reappearing as an empty roster.
 */
function migrateSuspectSlotsToCharacter(
  input: Record<string, unknown>,
  current: Readonly<{
    geometry: Record<SlotId, Rect>;
    images: Partial<Record<SlotId, SlotImageState>>;
  }>,
  characters: Record<WorkbenchCharacter, CharacterPartsState>,
  activeCharacter: WorkbenchCharacter,
): Readonly<{
  images: Partial<Record<SlotId, SlotImageState>>;
  characters: Record<WorkbenchCharacter, CharacterPartsState>;
}> {
  const version = typeof input.version === 'number' ? input.version : 0;
  if (version >= WORKBENCH_STATE_VERSION) {
    return { images: current.images, characters };
  }

  const images = { ...current.images };
  const target = activeCharacter;
  const migratedImages = { ...characters[target].images };
  const migratedOffsets = { ...characters[target].offsets };
  for (const [slotId, part] of [
    ['suspect-base', 'base'],
    ['suspect-state-parts', 'upset'],
    ['suspect-lose-parts', 'lose'],
    ['partner-base', 'base'],
    ['partner-used', 'used'],
  ] as const) {
    const image = images[slotId];
    if (image === undefined) continue;
    delete images[slotId];
    const owner = SLOT_CHARACTER_BINDINGS[slotId]?.character ?? target;
    if (owner === target) {
      migratedImages[part] ??= image;
      continue;
    }
    characters[owner] = {
      ...characters[owner],
      images: { ...characters[owner].images, [part]: characters[owner].images[part] ?? image },
    };
  }

  // v2 stored the overlay offset as a stage rectangle; the sidecar wants it in
  // authored pixels, so scale by however far the base slot was itself scaled.
  const base = current.geometry['suspect-base'];
  const scale = base.width > 0 ? ASSET_DIMENSIONS.suspect_base.width / base.width : 1;
  const limit = CHARACTER_PART_OFFSET_LIMIT;
  for (const [slotId, part] of [
    ['suspect-state-parts', 'upset'],
    ['suspect-lose-parts', 'lose'],
  ] as const) {
    if (migratedOffsets[part] !== undefined) continue;
    const rect = current.geometry[slotId];
    const offset = {
      x: clamp(Math.round((rect.x - base.x) * scale), -limit, limit),
      y: clamp(Math.round((rect.y - base.y) * scale), -limit, limit),
    };
    if (offset.x === 0 && offset.y === 0) continue;
    migratedOffsets[part] = offset;
  }

  characters[target] = { images: migratedImages, offsets: migratedOffsets };
  return { images, characters };
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
    aspectLocks: normalized.aspectLocks,
    images: normalized.images,
    activeCharacter: normalized.activeCharacter,
    characters: normalized.characters,
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

/**
 * Category prefix of an authored filename to the folder it belongs in.
 *
 * The runtime registry keys every PNG as `category/name/state` derived from the
 * filename alone and throws on a collision, so a file written to `assets/`
 * root would collide with the same file under its folder and stop the game
 * from booting. Routing is therefore mandatory, not cosmetic.
 *
 * Mirrors `tools/placeholder/placeholders.json`; a drift test pins them together.
 */
export const ASSET_CATEGORY_DIRECTORIES = {
  '배경': 'bg',
  '전경': 'fg',
  portrait: 'portraits',
  card: 'cards',
  ev: 'evidence',
  '아이콘': 'ui',
  placeholder: 'ui',
  dead: 'dead',
} as const satisfies Readonly<Record<string, string>>;

/** The folders a save may write into. Deliberately the map's values, not a
 * listing of `assets/` — `fonts`, `bgm` and `sfx` are not PNG targets. */
export const ASSET_WRITE_DIRECTORIES: readonly string[] = Object.freeze(
  [...new Set(Object.values(ASSET_CATEGORY_DIRECTORIES))].sort(),
);

/** The only PNG a save may never replace: every missing-asset fallback uses it. */
export const PROTECTED_ASSET_PATH = 'ui/placeholder_missing_fallback.png';

/** `배경_심문실_시안.png` -> `bg/배경_심문실_시안.png`. */
export function assetTargetPath(fileName: string): string | undefined {
  if (!fileName.toLowerCase().endsWith('.png')) return undefined;
  const stem = fileName.slice(0, -'.png'.length);
  const segments = stem.split('_');
  // `parseAssetFilename` requires category_name_state, so anything shorter would
  // crash the registry on the next boot even if it landed in the right folder.
  if (segments.length < 3) return undefined;
  const category = segments[0];
  if (category === undefined) return undefined;
  const directory = (ASSET_CATEGORY_DIRECTORIES as Readonly<Record<string, string>>)[category];
  return directory === undefined ? undefined : `${directory}/${fileName}`;
}

export interface WorkbenchSaveFile {
  readonly path: string;
  readonly dataUrl: string;
}

export interface WorkbenchSaveRequest {
  readonly manifest: AssetManifest;
  readonly files: readonly WorkbenchSaveFile[];
}

/** Filename a slot writes under, honouring character binding like the download does. */
export function stageSlotFileName(state: WorkbenchState, id: SlotId): string {
  const binding = resolveSlotBinding(state, id);
  return binding === undefined
    ? canonicalDownloadName(id)
    : characterPartFileName(binding.character, binding.part);
}

/**
 * Collects every filled slot into one save request. Empty slots, unroutable
 * filenames and the protected fallback are dropped here so the server never
 * has to reason about intent — only about safety.
 */
export function collectWorkbenchSaveRequest(state: WorkbenchState): WorkbenchSaveRequest {
  const byPath = new Map<string, WorkbenchSaveFile>();
  for (const definition of CANONICAL_SLOTS) {
    const image = resolveStageSlotImage(state, definition.id);
    if (image === undefined || !isPngDataUrl(image.dataUrl)) continue;
    const target = assetTargetPath(stageSlotFileName(state, definition.id));
    if (target === undefined || target === PROTECTED_ASSET_PATH) continue;
    // Several slots can bind to the same character part; the last one wins, and
    // deduping here keeps the request free of the duplicates the server rejects.
    byPath.set(target, { path: target, dataUrl: image.dataUrl });
  }
  return {
    manifest: buildAssetManifest(state),
    files: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export interface WorkbenchSaveSuccess {
  readonly assetsRoot: string;
  readonly savedFiles: readonly string[];
  readonly skippedFiles: readonly string[];
}

export function formatSaveSuccess(result: WorkbenchSaveSuccess): string {
  const saved = result.savedFiles.length;
  const skipped = result.skippedFiles.length;
  // Never claim the game reflects this: only the PNGs matter and the game tab
  // keeps its already-booted registry until it reloads.
  const head = `✅ PM 알림: ${String(saved)}개 에셋이 ${result.assetsRoot}/ 에 저장되었습니다.`;
  const tail = ' 게임 탭은 새로고침해야 반영됩니다.';
  return skipped === 0
    ? `${head}${tail}`
    : `${head} ${String(skipped)}개는 변경이 없어 건너뛰었습니다.${tail}`;
}

export function describeSaveError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '알 수 없는 오류';
}
