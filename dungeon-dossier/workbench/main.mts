import {
  DISTORTION_WARNING_THRESHOLD,
  degreesToRadians,
  radiansToDegrees,
  transformDistortion,
} from '../src/ui/core/assetManifest';
import {
  IMAGE_SLOT_CHANGE_EVENT,
  IMAGE_SLOT_SELECT_EVENT,
  type ImageSlotChangeDetail,
  type ImageSlotSelectDetail,
  type PlannerImageSlotElement,
} from './image-slot.mts';
import {
  ASSET_MANIFEST_JSON_NAME,
  CANONICAL_SLOTS,
  CHARACTER_PART_NAMES,
  PORTRAIT_PARTS_JSON_NAME,
  SLOT_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WORKBENCH_CHARACTERS,
  applyWorkbenchDrag,
  canonicalDownloadName,
  characterFromPartsManifest,
  characterPartFileName,
  characterPartHasOffset,
  characterPartNames,
  characterPartSlotId,
  characterPartsJsonName,
  clampRect,
  createInitialWorkbenchState,
  getCharacterPartImage,
  getCharacterPartOffset,
  getPartsOffset,
  getSlotDefinition,
  getSlotScale,
  getSlotSourceDimension,
  isSlotId,
  isSlotLocked,
  isWorkbenchCharacter,
  loadWorkbenchState,
  nudgeRect,
  patchRect,
  resetAllGeometry,
  resetSlotGeometry,
  resolveSlotBinding,
  resolveStageSlotImage,
  saveWorkbenchState,
  serializeAssetManifest,
  serializeCharacterPartsManifest,
  buildSlotTransform,
  collectWorkbenchSaveRequest,
  describeSaveError,
  formatSaveSuccess,
  serializePortraitPartsManifest,
  setSlotAspectLock,
  setSlotSize,
  toggleSlotLock,
  withActiveCharacter,
  withCharacterPartOffset,
  withImportedCharacterParts,
  withPartsOffset,
  withSlotRect,
  withSlotRotation,
  withSlotScale,
  withStageSlotImage,
  withoutStageSlotImage,
  type CharacterPartName,
  type Rect,
  type SlotId,
  type WorkbenchDragMode,
  type WorkbenchSaveRequest,
  type WorkbenchSaveSuccess,
  type WorkbenchState,
} from './model.mts';

const RECT_FIELDS = ['x', 'y', 'width', 'height'] as const;
const ROTATE_HANDLE_GAP = 22;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`워크벤치 요소를 찾을 수 없습니다: ${selector}`);
  return element;
}

const stage = requiredElement<HTMLDivElement>('#stage');
const stageShell = requiredElement<HTMLDivElement>('#stage-shell');
const gizmoLayer = requiredElement<HTMLDivElement>('.gizmo-layer');
const gizmo = requiredElement<HTMLDivElement>('#gizmo');
const tweakModeInput = requiredElement<HTMLInputElement>('#tweak-mode');
const zoomSelect = requiredElement<HTMLSelectElement>('#stage-zoom');
const slotSelect = requiredElement<HTMLSelectElement>('#slot-select');
const slotDescription = requiredElement<HTMLParagraphElement>('#slot-description');
const slotDownloadName = requiredElement<HTMLElement>('#slot-download-name');
const selectedSlotLabel = requiredElement<HTMLSpanElement>('#selected-slot-label');
const selectedSlotRect = requiredElement<HTMLElement>('#selected-slot-rect');
const saveStatus = requiredElement<HTMLOutputElement>('#save-status');
const geometryFieldset = requiredElement<HTMLFieldSetElement>('#geometry-fieldset');
const partsFieldset = requiredElement<HTMLFieldSetElement>('#parts-fieldset');
const partsXInput = requiredElement<HTMLInputElement>('#parts-x');
const partsYInput = requiredElement<HTMLInputElement>('#parts-y');
const partsJson = requiredElement<HTMLPreElement>('#parts-json');
const manifestJson = requiredElement<HTMLPreElement>('#manifest-json');
const assetList = requiredElement<HTMLDivElement>('#asset-list');
const lockButton = requiredElement<HTMLButtonElement>('#toggle-slot-lock');
const lockStatus = requiredElement<HTMLOutputElement>('#lock-status');
const chooseSelectedImageButton = requiredElement<HTMLButtonElement>('#choose-selected-image');
const downloadSelectedImageButton = requiredElement<HTMLButtonElement>('#download-selected-image');
const clearSelectedImageButton = requiredElement<HTMLButtonElement>('#clear-selected-image');
const clampSelectedGeometryButton = requiredElement<HTMLButtonElement>('#clamp-selected-geometry');
const resetSelectedGeometryButton = requiredElement<HTMLButtonElement>('#reset-selected-geometry');
const resetAllGeometryButton = requiredElement<HTMLButtonElement>('#reset-all-geometry');
const saveToProjectButton = requiredElement<HTMLButtonElement>('#save-to-project');
const downloadPartsJsonButton = requiredElement<HTMLButtonElement>('#download-parts-json');
const downloadManifestButton = requiredElement<HTMLButtonElement>('#download-asset-manifest');
const characterSelect = requiredElement<HTMLSelectElement>('#character-select');
const characterPartsContainer = requiredElement<HTMLDivElement>('#character-parts');
const characterPartsJson = requiredElement<HTMLPreElement>('#character-parts-json');
const characterPartsJsonLabel = requiredElement<HTMLElement>('#character-parts-json-name');
const downloadCharacterPartsButton = requiredElement<HTMLButtonElement>('#download-character-parts');
const importCharacterPartsButton = requiredElement<HTMLButtonElement>('#import-character-parts');
const characterPartsFileInput = requiredElement<HTMLInputElement>('#character-parts-file');

const geometryInputs: Readonly<Record<keyof Rect, HTMLInputElement>> = {
  x: requiredElement<HTMLInputElement>('#geometry-x'),
  y: requiredElement<HTMLInputElement>('#geometry-y'),
  width: requiredElement<HTMLInputElement>('#geometry-width'),
  height: requiredElement<HTMLInputElement>('#geometry-height'),
};
const rotationInput = requiredElement<HTMLInputElement>('#geometry-rotation');
const aspectLockInput = requiredElement<HTMLInputElement>('#geometry-aspect-lock');
const distortionBadge = requiredElement<HTMLOutputElement>('#geometry-distortion');
const scaleInputs = {
  x: requiredElement<HTMLInputElement>('#geometry-scale-x'),
  y: requiredElement<HTMLInputElement>('#geometry-scale-y'),
} as const;

const imageSlotElements = new Map<SlotId, PlannerImageSlotElement>();
for (const element of stage.querySelectorAll<PlannerImageSlotElement>('image-slot[data-slot-id]')) {
  const id = element.dataset.slotId;
  if (id !== undefined && isSlotId(id)) imageSlotElements.set(id, element);
}

if (
  imageSlotElements.size !== CANONICAL_SLOTS.length ||
  SLOT_IDS.some((id) => !imageSlotElements.has(id))
) {
  throw new Error(`워크벤치에는 정확히 ${CANONICAL_SLOTS.length}개의 canonical image-slot이 필요합니다.`);
}

for (const definition of CANONICAL_SLOTS) {
  const source = getSlotSourceDimension(definition.id);
  const option = document.createElement('option');
  option.value = definition.id;
  option.textContent = `${definition.label} · ${source.width}×${source.height}`;
  slotSelect.append(option);
}

const CHARACTER_PART_LABELS: Readonly<Record<CharacterPartName, string>> = {
  base: '기본',
  upset: '동요',
  lose: '패배',
  used: '쿨다운',
};

for (const character of WORKBENCH_CHARACTERS) {
  const option = document.createElement('option');
  option.value = character;
  option.textContent = character.replaceAll('_', ' ');
  characterSelect.append(option);
}

interface CharacterPartCard {
  readonly root: HTMLDivElement;
  readonly slot: PlannerImageSlotElement;
  readonly filename: HTMLElement;
  readonly status: HTMLElement;
  readonly offsetInputs: Readonly<Record<'x' | 'y', HTMLInputElement>>;
  readonly offsetFields: HTMLDivElement;
}

/**
 * One card per part name, built once. Switching characters only re-binds data,
 * so a slot never loses its drop target or its focus mid-edit.
 */
function buildCharacterPartCard(part: CharacterPartName): CharacterPartCard {
  const root = document.createElement('div');
  root.className = 'character-part';
  root.dataset.part = part;

  const slot = document.createElement('image-slot');
  slot.dataset.slotId = characterPartSlotId(part);
  slot.dataset.part = part;
  slot.setAttribute('slot-label', CHARACTER_PART_LABELS[part]);

  const meta = document.createElement('div');
  meta.className = 'character-part-meta';

  const title = document.createElement('div');
  title.className = 'character-part-title';
  const name = document.createElement('span');
  name.textContent = `${CHARACTER_PART_LABELS[part]} · ${part}`;
  const filename = document.createElement('code');
  title.append(name, filename);

  const status = document.createElement('div');
  status.className = 'character-part-status';

  const offsetFields = document.createElement('div');
  offsetFields.className = 'geometry-grid';
  const offsetInputs = {} as Record<'x' | 'y', HTMLInputElement>;
  for (const axis of ['x', 'y'] as const) {
    const control = document.createElement('div');
    control.className = 'coordinate-control';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.id = `character-offset-${part}-${axis}`;
    label.htmlFor = input.id;
    label.textContent = axis.toUpperCase();
    const decrease = document.createElement('button');
    decrease.type = 'button';
    decrease.dataset.characterAxis = axis;
    decrease.dataset.characterPart = part;
    decrease.dataset.delta = '-1';
    decrease.setAttribute('aria-label', `${part} ${axis.toUpperCase()} 1 감소`);
    decrease.textContent = '−';
    const increase = document.createElement('button');
    increase.type = 'button';
    increase.dataset.characterAxis = axis;
    increase.dataset.characterPart = part;
    increase.dataset.delta = '1';
    increase.setAttribute('aria-label', `${part} ${axis.toUpperCase()} 1 증가`);
    increase.textContent = '+';
    control.append(label, decrease, input, increase);
    offsetFields.append(control);
    offsetInputs[axis] = input;
  }

  meta.append(title, status, offsetFields);
  root.append(slot, meta);
  return { root, slot, filename, status, offsetInputs, offsetFields };
}

const characterPartCards = new Map<CharacterPartName, CharacterPartCard>(
  CHARACTER_PART_NAMES.map((part) => [part, buildCharacterPartCard(part)]),
);
for (const card of characterPartCards.values()) {
  characterPartsContainer.append(card.root);
}

let storage: Storage | undefined;
let state: WorkbenchState;
try {
  storage = window.localStorage;
  state = loadWorkbenchState(storage);
} catch {
  state = createInitialWorkbenchState();
  setStatus('localStorage를 사용할 수 없어 현재 탭에서만 유지됩니다.', true);
}

let selectedId: SlotId = 'bg-room';
let tweakMode = false;
let zoom = zoomSelect.value === '2' ? 2 : 1;

interface DragSession {
  readonly mode: WorkbenchDragMode;
  readonly slotId: SlotId;
  readonly pointerId: number;
  readonly startPoint: Readonly<{ x: number; y: number }>;
  readonly startRect: Rect;
  readonly startRotation: number;
}

let drag: DragSession | undefined;

function setStatus(message: string, isError = false): void {
  saveStatus.value = message;
  saveStatus.textContent = message;
  saveStatus.toggleAttribute('data-error', isError);
}

function persist(message: string): void {
  if (storage === undefined) {
    setStatus('현재 탭에 반영됨 · localStorage 사용 불가', true);
    return;
  }
  try {
    saveWorkbenchState(storage, state);
    setStatus(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    setStatus(`화면에는 반영됐지만 저장하지 못했습니다: ${reason}`, true);
  }
}

function commit(nextState: WorkbenchState, message: string): void {
  if (nextState === state) {
    setStatus(`${getSlotDefinition(selectedId).label}은(는) 고정되어 있습니다.`, true);
    return;
  }
  state = nextState;
  persist(message);
  render();
}

/** Live drag feedback; the final value is committed on pointer release. */
function preview(nextState: WorkbenchState): void {
  if (nextState === state) return;
  state = nextState;
  render();
}

function selectSlot(id: SlotId): void {
  selectedId = id;
  render();
}

function formatRect(rect: Rect): string {
  const degrees = Math.round(radiansToDegrees(state.rotation[selectedId]));
  const scale = getSlotScale(state, selectedId);
  return `x ${rect.x} · y ${rect.y} · ${rect.width}×${rect.height} · ${degrees}° · sx ${scale.scaleX.toFixed(3)} · sy ${scale.scaleY.toFixed(3)}`;
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function stageSlotDownloadName(id: SlotId): string {
  const binding = resolveSlotBinding(state, id);
  return binding === undefined
    ? canonicalDownloadName(id)
    : characterPartFileName(binding.character, binding.part);
}

function downloadSlotImage(id: SlotId): void {
  const image = resolveStageSlotImage(state, id);
  if (image === undefined) return;
  const filename = stageSlotDownloadName(id);
  triggerDownload(image.dataUrl, filename);
  setStatus(`${filename} 다운로드`);
}

function downloadTextFile(contents: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json;charset=utf-8' }),
  );
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Converts a pointer event into 640x400 stage coordinates. */
function stagePoint(event: PointerEvent): Readonly<{ x: number; y: number }> {
  const bounds = stage.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / zoom,
    y: (event.clientY - bounds.top) / zoom,
  };
}

function beginDrag(mode: WorkbenchDragMode, event: PointerEvent): void {
  if (!tweakMode || isSlotLocked(state, selectedId)) return;
  const rect = state.geometry[selectedId];
  const point = stagePoint(event);
  drag = {
    mode,
    slotId: selectedId,
    pointerId: event.pointerId,
    startPoint: point,
    startRect: rect,
    startRotation: state.rotation[selectedId],
  };
  event.preventDefault();
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
}

function applyDrag(session: DragSession, event: PointerEvent): WorkbenchState {
  return applyWorkbenchDrag(
    state,
    session.slotId,
    {
      mode: session.mode,
      startPoint: session.startPoint,
      currentPoint: stagePoint(event),
      startRect: session.startRect,
      startRotation: session.startRotation,
    },
  );
}

function onDragMove(event: PointerEvent): void {
  if (drag === undefined || event.pointerId !== drag.pointerId) return;
  preview(applyDrag(drag, event));
}

function onDragEnd(event: PointerEvent): void {
  if (drag === undefined || event.pointerId !== drag.pointerId) return;
  const session = drag;
  drag = undefined;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);

  const rect = state.geometry[session.slotId];
  const moved =
    rect.x !== session.startRect.x ||
    rect.y !== session.startRect.y ||
    rect.width !== session.startRect.width ||
    rect.height !== session.startRect.height ||
    state.rotation[session.slotId] !== session.startRotation;
  if (!moved) {
    render();
    return;
  }

  const action = session.mode === 'move' ? '이동' : session.mode === 'rotate' ? '회전' : '크기 조절';
  persist(`${getSlotDefinition(session.slotId).label} ${action}`);
  render();
}

function renderGizmo(): void {
  const rect = state.geometry[selectedId];
  const locked = isSlotLocked(state, selectedId);
  gizmo.hidden = !tweakMode;
  gizmo.toggleAttribute('data-locked', locked);
  gizmo.style.left = `${rect.x}px`;
  gizmo.style.top = `${rect.y}px`;
  gizmo.style.width = `${rect.width}px`;
  gizmo.style.height = `${rect.height}px`;
  gizmo.style.transform = `rotate(${state.rotation[selectedId]}rad)`;
  gizmo.style.setProperty('--rotate-gap', `${ROTATE_HANDLE_GAP}px`);
}

function renderAssetList(): void {
  const fragment = document.createDocumentFragment();

  for (const definition of CANONICAL_SLOTS) {
    const image = resolveStageSlotImage(state, definition.id);
    const source = getSlotSourceDimension(definition.id);
    const row = document.createElement('div');
    row.className = 'asset-row';
    row.dataset.slotId = definition.id;
    row.toggleAttribute('data-selected', definition.id === selectedId);
    row.toggleAttribute('data-locked', state.locks[definition.id]);
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `${definition.label} 선택`);

    const main = document.createElement('div');
    main.className = 'asset-row-main';

    const title = document.createElement('div');
    title.className = 'asset-row-title';
    const label = document.createElement('span');
    label.textContent = definition.label;
    const size = document.createElement('code');
    size.textContent = `${source.width}×${source.height}`;
    title.append(label, size);

    const filename = document.createElement('div');
    filename.className = 'asset-row-file';
    filename.textContent = stageSlotDownloadName(definition.id);

    const status = document.createElement('div');
    status.className = 'asset-row-status';
    status.toggleAttribute('data-filled', image !== undefined);
    const lockMark = state.locks[definition.id] ? ' · 고정됨' : '';
    status.textContent =
      image === undefined ? `비어 있음${lockMark}` : `채움 · ${image.originalName}${lockMark}`;

    main.append(title, filename, status);

    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = 'PNG 저장';
    download.disabled = image === undefined;
    download.addEventListener('click', (event) => {
      event.stopPropagation();
      downloadSlotImage(definition.id);
    });

    const activate = (): void => selectSlot(definition.id);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });

    row.append(main, download);
    fragment.append(row);
  }

  assetList.replaceChildren(fragment);
}

function renderCharacterPanel(): void {
  const character = state.activeCharacter;
  const available = new Set(characterPartNames(character));
  characterSelect.value = character;
  characterPartsJsonLabel.textContent = characterPartsJsonName(character);

  for (const [part, card] of characterPartCards) {
    const supported = available.has(part);
    card.root.hidden = !supported;
    if (!supported) continue;
    const owner = resolveSlotBinding(state, characterPartSlotId(part))?.character ?? character;
    const image = getCharacterPartImage(state, owner, part);
    const offset = getCharacterPartOffset(state, owner, part);
    card.slot.setImage(image);
    card.filename.textContent = characterPartFileName(owner, part);
    card.status.textContent =
      image === undefined ? '비어 있음 · PNG 드롭/선택' : `채움 · ${image.originalName}`;
    // Only the exported state parts carry an offset; showing the field for the
    // others would accept edits no artifact could ever record.
    card.offsetFields.hidden = !characterPartHasOffset(part);
    card.offsetInputs.x.value = String(offset.x);
    card.offsetInputs.y.value = String(offset.y);
  }

  characterPartsJson.textContent = serializeCharacterPartsManifest(state, character);
}

function render(): void {
  for (const definition of CANONICAL_SLOTS) {
    const element = imageSlotElements.get(definition.id);
    if (element === undefined) continue;
    const rect = state.geometry[definition.id];
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.zIndex = definition.layer.toString();
    element.style.transform = `rotate(${state.rotation[definition.id]}rad)`;
    element.setImage(resolveStageSlotImage(state, definition.id));
    element.toggleAttribute('tweak-mode', tweakMode);
    element.toggleAttribute('data-locked', state.locks[definition.id]);
    element.toggleAttribute('data-selected', tweakMode && definition.id === selectedId);
  }

  stage.style.transform = `scale(${zoom})`;
  gizmoLayer.style.transform = `scale(${zoom})`;
  stageShell.style.width = `${STAGE_WIDTH * zoom}px`;
  stageShell.style.height = `${STAGE_HEIGHT * zoom}px`;

  const definition = getSlotDefinition(selectedId);
  const source = getSlotSourceDimension(selectedId);
  const rect = state.geometry[selectedId];
  const locked = isSlotLocked(state, selectedId);
  selectedSlotLabel.textContent = definition.label;
  selectedSlotRect.textContent = formatRect(rect);
  slotSelect.value = selectedId;
  slotDescription.textContent =
    `${definition.description} · 원본 ${source.width}×${source.height}px · 배치 ${rect.width}×${rect.height}px`;
  slotDownloadName.textContent = stageSlotDownloadName(selectedId);

  geometryInputs.x.value = String(rect.x);
  geometryInputs.y.value = String(rect.y);
  geometryInputs.width.value = String(rect.width);
  geometryInputs.height.value = String(rect.height);
  rotationInput.value = String(Math.round(radiansToDegrees(state.rotation[selectedId])));
  const scale = getSlotScale(state, selectedId);
  scaleInputs.x.value = String(Math.round(scale.scaleX * 100));
  scaleInputs.y.value = String(Math.round(scale.scaleY * 100));
  const aspectLocked = state.aspectLocks[selectedId];
  aspectLockInput.checked = aspectLocked;
  const distortion = transformDistortion(
    buildSlotTransform(state, selectedId),
    getSlotDefinition(selectedId).dimension,
  );
  const distorted = distortion > DISTORTION_WARNING_THRESHOLD;
  distortionBadge.hidden = !distorted;
  distortionBadge.textContent = distorted
    ? `비율 왜곡 ${(distortion * 100).toFixed(1)}%`
    : '';
  geometryFieldset.disabled = !tweakMode || locked;
  partsFieldset.disabled = !tweakMode || isSlotLocked(state, 'suspect-state-parts');

  lockButton.setAttribute('aria-pressed', String(locked));
  lockButton.toggleAttribute('data-locked', locked);
  lockButton.textContent = locked ? '고정 해제' : '확정 / 고정';
  lockStatus.value = locked ? '고정됨 · 드래그 차단' : '자유 편집';
  lockStatus.textContent = lockStatus.value;

  const partsOffset = getPartsOffset(state.geometry);
  partsXInput.value = String(partsOffset.x);
  partsYInput.value = String(partsOffset.y);
  partsJson.textContent = serializePortraitPartsManifest(state.geometry);
  manifestJson.textContent = serializeAssetManifest(state);

  const hasSelectedImage = resolveStageSlotImage(state, selectedId) !== undefined;
  downloadSelectedImageButton.disabled = !hasSelectedImage;
  clearSelectedImageButton.disabled = !hasSelectedImage;

  renderGizmo();
  renderAssetList();
  renderCharacterPanel();
}

stage.addEventListener(IMAGE_SLOT_SELECT_EVENT, (event) => {
  const detail = (event as CustomEvent<ImageSlotSelectDetail>).detail;
  if (isSlotId(detail.slotId)) selectSlot(detail.slotId);
});

stage.addEventListener(IMAGE_SLOT_CHANGE_EVENT, (event) => {
  const detail = (event as CustomEvent<ImageSlotChangeDetail>).detail;
  if (!isSlotId(detail.slotId)) return;
  selectedId = detail.slotId;
  commit(
    withStageSlotImage(state, detail.slotId, detail.image),
    `${stageSlotDownloadName(detail.slotId)} 저장됨`,
  );
});

characterPartsContainer.addEventListener(IMAGE_SLOT_CHANGE_EVENT, (event) => {
  const detail = (event as CustomEvent<ImageSlotChangeDetail>).detail;
  if (!isSlotId(detail.slotId)) return;
  commit(
    withStageSlotImage(state, detail.slotId, detail.image),
    `${stageSlotDownloadName(detail.slotId)} 저장됨`,
  );
});

// The panel slots are editors, not stage selections; swallow the select event
// so clicking a card does not retarget the gizmo.
characterPartsContainer.addEventListener(IMAGE_SLOT_SELECT_EVENT, (event) => {
  event.stopPropagation();
});

characterSelect.addEventListener('change', () => {
  const character = characterSelect.value;
  if (!isWorkbenchCharacter(character)) {
    render();
    return;
  }
  commit(withActiveCharacter(state, character), `캐릭터 ${character.replaceAll('_', ' ')} 선택`);
});

function applyCharacterOffset(
  part: CharacterPartName,
  axis: 'x' | 'y',
  value: number,
): void {
  const current = getCharacterPartOffset(state, state.activeCharacter, part);
  commit(
    withCharacterPartOffset(
      state,
      state.activeCharacter,
      part,
      axis === 'x' ? value : current.x,
      axis === 'y' ? value : current.y,
    ),
    `${state.activeCharacter.replaceAll('_', ' ')} ${part} 오프셋 조정`,
  );
}

characterPartsContainer.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('button[data-character-axis]');
  if (button === null) return;
  const axis = button.dataset.characterAxis;
  const part = button.dataset.characterPart;
  const delta = Number(button.dataset.delta);
  if ((axis !== 'x' && axis !== 'y') || part === undefined || !Number.isFinite(delta)) return;
  if (!isCharacterPart(part)) return;
  const current = getCharacterPartOffset(state, state.activeCharacter, part);
  applyCharacterOffset(part, axis, current[axis] + delta);
});

characterPartsContainer.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const card = target.closest<HTMLDivElement>('.character-part');
  const part = card?.dataset.part;
  if (part === undefined || !isCharacterPart(part)) return;
  const axis = target.id.endsWith('-x') ? 'x' : 'y';
  const value = Number(target.value);
  if (!Number.isFinite(value)) {
    render();
    return;
  }
  applyCharacterOffset(part, axis, value);
});

downloadCharacterPartsButton.addEventListener('click', () => {
  const filename = characterPartsJsonName(state.activeCharacter);
  downloadTextFile(serializeCharacterPartsManifest(state, state.activeCharacter), filename);
  setStatus(`${filename} 다운로드`);
});

importCharacterPartsButton.addEventListener('click', () => {
  characterPartsFileInput.click();
});

characterPartsFileInput.addEventListener('change', () => {
  const file = characterPartsFileInput.files?.item(0);
  characterPartsFileInput.value = '';
  if (file === null || file === undefined) return;
  void file
    .text()
    .then((source) => {
      const parsed = JSON.parse(source) as unknown;
      // The sidecar names its own character; fall back to the selection so a
      // renamed file still lands somewhere the planner expects.
      const character = characterFromPartsManifest(parsed) ?? state.activeCharacter;
      const next = withImportedCharacterParts(
        withActiveCharacter(state, character),
        character,
        parsed,
      );
      state = next;
      persist(`${characterPartsJsonName(character)} 가져옴`);
      render();
    })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      setStatus(`사이드카를 가져오지 못했습니다: ${reason}`, true);
    });
});

stageShell.addEventListener('pointerdown', (event) => {
  if (!tweakMode || !(event.target instanceof Element)) return;
  const handle = event.target.closest<HTMLButtonElement>('[data-gizmo]');
  if (handle !== null) {
    beginDrag(handle.dataset.gizmo === 'rotate' ? 'rotate' : 'scale', event);
    return;
  }
  const slotElement = event.target.closest<PlannerImageSlotElement>('image-slot[data-slot-id]');
  const id = slotElement?.dataset.slotId;
  if (id === undefined || !isSlotId(id)) return;
  selectedId = id;
  render();
  beginDrag('move', event);
});

tweakModeInput.addEventListener('change', () => {
  tweakMode = tweakModeInput.checked;
  setStatus(tweakMode ? 'Tweak Mode 켜짐' : 'Tweak Mode 꺼짐');
  render();
});

zoomSelect.addEventListener('change', () => {
  zoom = zoomSelect.value === '2' ? 2 : 1;
  render();
});

slotSelect.addEventListener('change', () => {
  if (isSlotId(slotSelect.value)) selectSlot(slotSelect.value);
});

lockButton.addEventListener('click', () => {
  state = toggleSlotLock(state, selectedId);
  persist(
    isSlotLocked(state, selectedId)
      ? `${getSlotDefinition(selectedId).label} 고정됨`
      : `${getSlotDefinition(selectedId).label} 고정 해제`,
  );
  render();
});

chooseSelectedImageButton.addEventListener('click', () => {
  imageSlotElements.get(selectedId)?.chooseFile();
});

downloadSelectedImageButton.addEventListener('click', () => {
  downloadSlotImage(selectedId);
});

clearSelectedImageButton.addEventListener('click', () => {
  commit(
    withoutStageSlotImage(state, selectedId),
    `${getSlotDefinition(selectedId).label} 이미지 비움`,
  );
});

geometryFieldset.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const rotateButton = target.closest<HTMLButtonElement>('button[data-rotation-delta]');
  if (rotateButton !== null) {
    const delta = Number(rotateButton.dataset.rotationDelta);
    if (!Number.isFinite(delta)) return;
    commit(
      withSlotRotation(
        state,
        selectedId,
        state.rotation[selectedId] + degreesToRadians(delta),
      ),
      `${getSlotDefinition(selectedId).label} 회전 조정`,
    );
    return;
  }
  const scaleButton = target.closest<HTMLButtonElement>('button[data-scale-delta]');
  if (scaleButton !== null) {
    const delta = Number(scaleButton.dataset.scaleDelta);
    const axis = scaleButton.dataset.scaleAxis;
    if (!Number.isFinite(delta) || (axis !== 'x' && axis !== 'y')) return;
    const scale = getSlotScale(state, selectedId);
    commit(
      withSlotScale(
        state,
        selectedId,
        axis === 'x' ? scale.scaleX + delta / 100 : scale.scaleX,
        axis === 'y' ? scale.scaleY + delta / 100 : scale.scaleY,
      ),
      `${getSlotDefinition(selectedId).label} 크기 조정`,
    );
    return;
  }
  const button = target.closest<HTMLButtonElement>('button[data-geometry-field]');
  if (button === null) return;
  const field = button.dataset.geometryField;
  const delta = Number(button.dataset.delta);
  if (!isRectField(field) || !Number.isFinite(delta)) return;
  commit(
    withSlotRect(state, selectedId, nudgeRect(state.geometry[selectedId], field, delta)),
    `${getSlotDefinition(selectedId).label} 좌표 조정`,
  );
});

for (const field of RECT_FIELDS) {
  geometryInputs[field].addEventListener('change', () => {
    const value = Number(geometryInputs[field].value);
    if (!Number.isFinite(value)) {
      render();
      return;
    }
    // A locked slot derives the opposite edge so typing a width cannot silently
    // distort the art; x/y are pure placement and never touch the ratio.
    const next = (field === 'width' || field === 'height') && state.aspectLocks[selectedId]
      ? setSlotSize(state, selectedId, { [field]: value })
      : withSlotRect(
          state,
          selectedId,
          patchRect(state.geometry[selectedId], { [field]: value }),
        );
    commit(next, `${getSlotDefinition(selectedId).label} 좌표 입력`);
  });
}

aspectLockInput.addEventListener('change', () => {
  commit(
    setSlotAspectLock(state, selectedId, aspectLockInput.checked),
    `${getSlotDefinition(selectedId).label} 비율 유지 ${aspectLockInput.checked ? '켜기' : '끄기'}`,
  );
});

rotationInput.addEventListener('change', () => {
  const degrees = Number(rotationInput.value);
  if (!Number.isFinite(degrees)) {
    render();
    return;
  }
  commit(
    withSlotRotation(state, selectedId, degreesToRadians(degrees)),
    `${getSlotDefinition(selectedId).label} 회전 입력`,
  );
});

for (const axis of ['x', 'y'] as const) {
  scaleInputs[axis].addEventListener('change', () => {
    const percent = Number(scaleInputs[axis].value);
    if (!Number.isFinite(percent) || percent <= 0) {
      render();
      return;
    }
    const scale = getSlotScale(state, selectedId);
    commit(
      withSlotScale(
        state,
        selectedId,
        axis === 'x' ? percent / 100 : scale.scaleX,
        axis === 'y' ? percent / 100 : scale.scaleY,
      ),
      `${getSlotDefinition(selectedId).label} ${axis === 'x' ? '가로' : '세로'} 크기 입력`,
    );
  });
}

clampSelectedGeometryButton.addEventListener('click', () => {
  commit(
    withSlotRect(state, selectedId, clampRect(state.geometry[selectedId])),
    `${getSlotDefinition(selectedId).label} 스테이지 안으로 맞춤`,
  );
});

resetSelectedGeometryButton.addEventListener('click', () => {
  commit(
    resetSlotGeometry(state, selectedId),
    `${getSlotDefinition(selectedId).label} 기본 좌표 복원`,
  );
});

resetAllGeometryButton.addEventListener('click', () => {
  commit(resetAllGeometry(state), `${CANONICAL_SLOTS.length}개 슬롯 기본 좌표 복원`);
});

partsFieldset.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('button[data-parts-axis]');
  if (button === null) return;
  const axis = button.dataset.partsAxis;
  const delta = Number(button.dataset.delta);
  if ((axis !== 'x' && axis !== 'y') || !Number.isFinite(delta)) return;
  const offset = getPartsOffset(state.geometry);
  selectedId = 'suspect-state-parts';
  commit(
    withPartsOffset(
      state,
      axis === 'x' ? offset.x + delta : offset.x,
      axis === 'y' ? offset.y + delta : offset.y,
    ),
    '상태 파츠 오프셋 조정',
  );
});

function applyPartsInputs(): void {
  const x = Number(partsXInput.value);
  const y = Number(partsYInput.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    render();
    return;
  }
  selectedId = 'suspect-state-parts';
  commit(withPartsOffset(state, x, y), '상태 파츠 오프셋 입력');
}

partsXInput.addEventListener('change', applyPartsInputs);
partsYInput.addEventListener('change', applyPartsInputs);

downloadPartsJsonButton.addEventListener('click', () => {
  downloadTextFile(
    serializePortraitPartsManifest(state.geometry),
    PORTRAIT_PARTS_JSON_NAME,
  );
  setStatus(`${PORTRAIT_PARTS_JSON_NAME} 다운로드`);
});

downloadManifestButton.addEventListener('click', () => {
  downloadTextFile(serializeAssetManifest(state), ASSET_MANIFEST_JSON_NAME);
  setStatus(`${ASSET_MANIFEST_JSON_NAME} 다운로드`);
});

function isRectField(value: string | undefined): value is keyof Rect {
  return value !== undefined && (RECT_FIELDS as readonly string[]).includes(value);
}

function isCharacterPart(value: string): value is CharacterPartName {
  return (CHARACTER_PART_NAMES as readonly string[]).includes(value);
}

render();
if (storage !== undefined) setStatus('localStorage에서 워크벤치 상태를 불러왔습니다.');

/**
 * Posts the collected slots to the dev-server middleware. Only the dev server
 * carries that route, so a 404 means the planner opened a built preview rather
 * than `pnpm dev`.
 */
async function postWorkbenchSave(
  request: WorkbenchSaveRequest,
): Promise<WorkbenchSaveSuccess> {
  const response = await fetch('/api/workbench/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(request),
  });
  if (response.status === 404) {
    throw new Error('개발 서버에서만 사용할 수 있습니다. (pnpm dev)');
  }
  const payload = (await response.json()) as
    | { ok: true; assetsRoot: string; savedFiles: string[]; skippedFiles: string[] }
    | { ok: false; message?: string };
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      'message' in payload && payload.message !== undefined
        ? payload.message
        : `서버가 ${String(response.status)}을(를) 반환했습니다.`,
    );
  }
  return {
    assetsRoot: payload.assetsRoot,
    savedFiles: payload.savedFiles,
    skippedFiles: payload.skippedFiles,
  };
}

let saving = false;

saveToProjectButton.addEventListener('click', () => {
  if (saving) return;
  const request = collectWorkbenchSaveRequest(state);
  if (request.files.length === 0) {
    setStatus('저장할 이미지가 없습니다. 먼저 슬롯에 PNG를 올려 주세요.', true);
    return;
  }
  saving = true;
  saveToProjectButton.disabled = true;
  setStatus(`프로젝트 폴더에 저장 중… (${String(request.files.length)}개 파일)`);
  void postWorkbenchSave(request)
    .then((result) => { setStatus(formatSaveSuccess(result)); })
    .catch((error: unknown) => {
      setStatus(`❌ 저장 실패: ${describeSaveError(error)}`, true);
    })
    .finally(() => {
      saving = false;
      saveToProjectButton.disabled = false;
    });
});
