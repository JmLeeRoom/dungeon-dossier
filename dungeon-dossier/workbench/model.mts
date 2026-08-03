export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 400;

export const WORKBENCH_STORAGE_KEY = 'dungeon-dossier.asset-workbench.v1';
export const WORKBENCH_STATE_VERSION = 1;
export const PORTRAIT_PARTS_JSON_NAME = 'portrait_용의자.parts.json';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SLOT_IDS = [
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
] as const;

export type SlotId = (typeof SLOT_IDS)[number];

export interface SlotDefinition {
  readonly id: SlotId;
  readonly label: string;
  readonly description: string;
  readonly defaultRect: Rect;
  readonly layer: number;
  readonly downloadName: string;
}

/**
 * The only asset slots in the planner workbench. Sizes and initial placement
 * are measured in the same 640x400 coordinate space used by the game stage.
 */
export const CANONICAL_SLOTS: readonly SlotDefinition[] = [
  {
    id: 'bg-room',
    label: '취조실 배경',
    description: '사전 베이크 팔레트 배경',
    defaultRect: { x: 0, y: 0, width: 640, height: 400 },
    layer: 0,
    downloadName: 'bg_취조실_기본.png',
  },
  {
    id: 'portrait-base',
    label: '용의자 베이스',
    description: '책상 뒤 중앙 인물',
    defaultRect: { x: 222, y: 40, width: 196, height: 216 },
    layer: 10,
    downloadName: 'portrait_용의자_base.png',
  },
  {
    id: 'portrait-parts',
    label: '표정 파츠',
    description: '눈썹·땀·입 오버레이',
    defaultRect: { x: 272, y: 84, width: 96, height: 40 },
    layer: 20,
    downloadName: 'portrait_용의자_parts.png',
  },
  {
    id: 'fg-desk',
    label: '책상 전경',
    description: '투명 PNG 전경 레이어',
    defaultRect: { x: 0, y: 282, width: 640, height: 118 },
    layer: 30,
    downloadName: 'fg_책상_전경.png',
  },
  {
    id: 'card-art-1',
    label: '카드 일러스트 1',
    description: '질문 카드 예시',
    defaultRect: { x: 220, y: 345, width: 56, height: 44 },
    layer: 50,
    downloadName: 'card_질문_일러.png',
  },
  {
    id: 'card-art-2',
    label: '카드 일러스트 2',
    description: '모순 카드 예시',
    defaultRect: { x: 292, y: 345, width: 56, height: 44 },
    layer: 50,
    downloadName: 'card_모순_일러.png',
  },
  {
    id: 'card-art-3',
    label: '카드 일러스트 3',
    description: '압박 카드 예시',
    defaultRect: { x: 364, y: 345, width: 56, height: 44 },
    layer: 50,
    downloadName: 'card_압박_일러.png',
  },
  {
    id: 'ev-1',
    label: '증거 1',
    description: '증거 주머니 첫 번째 칸',
    defaultRect: { x: 13, y: 363, width: 36, height: 36 },
    layer: 50,
    downloadName: 'ev_사건_증거1.png',
  },
  {
    id: 'ev-2',
    label: '증거 2',
    description: '증거 주머니 두 번째 칸',
    defaultRect: { x: 53, y: 363, width: 36, height: 36 },
    layer: 50,
    downloadName: 'ev_사건_증거2.png',
  },
  {
    id: 'ev-3',
    label: '증거 3',
    description: '증거 주머니 세 번째 칸',
    defaultRect: { x: 93, y: 363, width: 36, height: 36 },
    layer: 50,
    downloadName: 'ev_사건_증거3.png',
  },
  {
    id: 'icon-composure',
    label: '평정심 아이콘',
    description: '상단 HUD 16px 아이콘',
    defaultRect: { x: 190, y: 5, width: 16, height: 16 },
    layer: 60,
    downloadName: 'ui_아이콘_평정심.png',
  },
  {
    id: 'icon-coercion',
    label: '강압 아이콘',
    description: '상단 HUD 16px 아이콘',
    defaultRect: { x: 372, y: 5, width: 16, height: 16 },
    layer: 60,
    downloadName: 'ui_아이콘_강압.png',
  },
  {
    id: 'partner',
    label: '파트너',
    description: '김 인턴 좌석',
    defaultRect: { x: 554, y: 302, width: 72, height: 88 },
    layer: 50,
    downloadName: 'partner_김인턴_기본.png',
  },
] as const;

export interface SlotImageState {
  readonly dataUrl: string;
  readonly originalName: string;
}

export interface WorkbenchState {
  readonly version: typeof WORKBENCH_STATE_VERSION;
  readonly geometry: Readonly<Record<SlotId, Rect>>;
  readonly images: Readonly<Partial<Record<SlotId, SlotImageState>>>;
}

export interface FileDescriptor {
  readonly name: string;
  readonly type: string;
}

export type PngValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

export interface PortraitPartsManifest {
  readonly schema_version: '1.0';
  readonly base: Readonly<{
    slot: 'portrait-base';
    image: string;
  }>;
  readonly parts: Readonly<{
    slot: 'portrait-parts';
    image: string;
    origin: 'portrait-base';
    x: number;
    y: number;
    width: number;
    height: number;
    stage_x: number;
    stage_y: number;
  }>;
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

export function createDefaultGeometry(): Record<SlotId, Rect> {
  return Object.fromEntries(
    CANONICAL_SLOTS.map((definition) => [
      definition.id,
      { ...definition.defaultRect },
    ]),
  ) as Record<SlotId, Rect>;
}

export function createInitialWorkbenchState(): WorkbenchState {
  return {
    version: WORKBENCH_STATE_VERSION,
    geometry: createDefaultGeometry(),
    images: {},
  };
}

/** Constrains a rectangle to integer pixels fully inside the 640x400 stage. */
export function clampRect(rect: Rect): Rect {
  const width = clamp(finiteInteger(rect.width, 1), 1, STAGE_WIDTH);
  const height = clamp(finiteInteger(rect.height, 1), 1, STAGE_HEIGHT);
  const x = clamp(finiteInteger(rect.x, 0), 0, STAGE_WIDTH - width);
  const y = clamp(finiteInteger(rect.y, 0), 0, STAGE_HEIGHT - height);
  return { x, y, width, height };
}

export function patchRect(rect: Rect, patch: Partial<Rect>): Rect {
  return clampRect({ ...rect, ...patch });
}

export function nudgeRect(
  rect: Rect,
  field: keyof Rect,
  delta: number,
): Rect {
  return patchRect(rect, { [field]: rect[field] + finiteInteger(delta, 0) });
}

export function withSlotRect(
  state: WorkbenchState,
  id: SlotId,
  rect: Rect,
): WorkbenchState {
  return {
    ...state,
    geometry: {
      ...state.geometry,
      [id]: clampRect(rect),
    },
  };
}

export function resetSlotGeometry(
  state: WorkbenchState,
  id: SlotId,
): WorkbenchState {
  return withSlotRect(state, id, getSlotDefinition(id).defaultRect);
}

export function resetAllGeometry(state: WorkbenchState): WorkbenchState {
  return { ...state, geometry: createDefaultGeometry() };
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

export function isPngDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/png;base64,/iu.test(value);
}

export function canonicalDownloadName(id: SlotId): string {
  return getSlotDefinition(id).downloadName;
}

export function getPartsOffset(
  geometry: Readonly<Record<SlotId, Rect>>,
): Readonly<{ x: number; y: number }> {
  const base = geometry['portrait-base'];
  const parts = geometry['portrait-parts'];
  return { x: parts.x - base.x, y: parts.y - base.y };
}

export function withPartsOffset(
  state: WorkbenchState,
  requestedX: number,
  requestedY: number,
): WorkbenchState {
  const base = state.geometry['portrait-base'];
  const parts = state.geometry['portrait-parts'];
  const maxX = Math.max(0, base.width - parts.width);
  const maxY = Math.max(0, base.height - parts.height);
  const x = clamp(finiteInteger(requestedX, 0), 0, maxX);
  const y = clamp(finiteInteger(requestedY, 0), 0, maxY);
  return withSlotRect(state, 'portrait-parts', {
    ...parts,
    x: base.x + x,
    y: base.y + y,
  });
}

export function buildPortraitPartsManifest(
  geometry: Readonly<Record<SlotId, Rect>>,
): PortraitPartsManifest {
  const parts = geometry['portrait-parts'];
  const offset = getPartsOffset(geometry);
  return {
    schema_version: '1.0',
    base: {
      slot: 'portrait-base',
      image: canonicalDownloadName('portrait-base'),
    },
    parts: {
      slot: 'portrait-parts',
      image: canonicalDownloadName('portrait-parts'),
      origin: 'portrait-base',
      x: offset.x,
      y: offset.y,
      width: parts.width,
      height: parts.height,
      stage_x: parts.x,
      stage_y: parts.y,
    },
  };
}

export function serializePortraitPartsManifest(
  geometry: Readonly<Record<SlotId, Rect>>,
): string {
  return `${JSON.stringify(buildPortraitPartsManifest(geometry), null, 2)}\n`;
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
    images,
  };
}

export function serializeWorkbenchState(state: WorkbenchState): string {
  return JSON.stringify(normalizeWorkbenchState(state));
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
