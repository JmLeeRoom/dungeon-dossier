import {
  IMAGE_SLOT_CHANGE_EVENT,
  IMAGE_SLOT_SELECT_EVENT,
  type ImageSlotChangeDetail,
  type ImageSlotSelectDetail,
  type PlannerImageSlotElement,
} from './image-slot.mts';
import {
  CANONICAL_SLOTS,
  PORTRAIT_PARTS_JSON_NAME,
  SLOT_IDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  canonicalDownloadName,
  clampRect,
  createInitialWorkbenchState,
  getPartsOffset,
  getSlotDefinition,
  isSlotId,
  loadWorkbenchState,
  nudgeRect,
  patchRect,
  resetAllGeometry,
  resetSlotGeometry,
  saveWorkbenchState,
  serializePortraitPartsManifest,
  withPartsOffset,
  withSlotImage,
  withSlotRect,
  withoutSlotImage,
  type Rect,
  type SlotId,
  type WorkbenchState,
} from './model.mts';

const RECT_FIELDS = ['x', 'y', 'width', 'height'] as const;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`워크벤치 요소를 찾을 수 없습니다: ${selector}`);
  return element;
}

const stage = requiredElement<HTMLDivElement>('#stage');
const stageShell = requiredElement<HTMLDivElement>('#stage-shell');
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
const assetList = requiredElement<HTMLDivElement>('#asset-list');
const chooseSelectedImageButton = requiredElement<HTMLButtonElement>('#choose-selected-image');
const downloadSelectedImageButton = requiredElement<HTMLButtonElement>('#download-selected-image');
const clearSelectedImageButton = requiredElement<HTMLButtonElement>('#clear-selected-image');
const clampSelectedGeometryButton = requiredElement<HTMLButtonElement>('#clamp-selected-geometry');
const resetSelectedGeometryButton = requiredElement<HTMLButtonElement>('#reset-selected-geometry');
const resetAllGeometryButton = requiredElement<HTMLButtonElement>('#reset-all-geometry');
const downloadPartsJsonButton = requiredElement<HTMLButtonElement>('#download-parts-json');

const geometryInputs: Readonly<Record<keyof Rect, HTMLInputElement>> = {
  x: requiredElement<HTMLInputElement>('#geometry-x'),
  y: requiredElement<HTMLInputElement>('#geometry-y'),
  width: requiredElement<HTMLInputElement>('#geometry-width'),
  height: requiredElement<HTMLInputElement>('#geometry-height'),
};

const imageSlotElements = new Map<SlotId, PlannerImageSlotElement>();
for (const element of document.querySelectorAll<PlannerImageSlotElement>('image-slot[data-slot-id]')) {
  const id = element.dataset.slotId;
  if (id !== undefined && isSlotId(id)) imageSlotElements.set(id, element);
}

if (
  imageSlotElements.size !== CANONICAL_SLOTS.length ||
  SLOT_IDS.some((id) => !imageSlotElements.has(id))
) {
  throw new Error('워크벤치에는 정확히 13개의 canonical image-slot이 필요합니다.');
}

for (const definition of CANONICAL_SLOTS) {
  const option = document.createElement('option');
  option.value = definition.id;
  option.textContent = `${definition.label} · ${definition.defaultRect.width}×${definition.defaultRect.height}`;
  slotSelect.append(option);
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
let zoom = 1;

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
  state = nextState;
  persist(message);
  render();
}

function selectSlot(id: SlotId): void {
  selectedId = id;
  render();
}

function formatRect(rect: Rect): string {
  return `x ${rect.x} · y ${rect.y} · ${rect.width}×${rect.height}`;
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

function downloadSlotImage(id: SlotId): void {
  const image = state.images[id];
  if (image === undefined) return;
  triggerDownload(image.dataUrl, canonicalDownloadName(id));
  setStatus(`${canonicalDownloadName(id)} 다운로드`);
}

function downloadTextFile(contents: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json;charset=utf-8' }),
  );
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderAssetList(): void {
  const fragment = document.createDocumentFragment();

  for (const definition of CANONICAL_SLOTS) {
    const image = state.images[definition.id];
    const row = document.createElement('div');
    row.className = 'asset-row';
    row.dataset.slotId = definition.id;
    row.toggleAttribute('data-selected', definition.id === selectedId);
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
    size.textContent = `${definition.defaultRect.width}×${definition.defaultRect.height}`;
    title.append(label, size);

    const filename = document.createElement('div');
    filename.className = 'asset-row-file';
    filename.textContent = definition.downloadName;

    const status = document.createElement('div');
    status.className = 'asset-row-status';
    status.toggleAttribute('data-filled', image !== undefined);
    status.textContent = image === undefined ? '비어 있음' : `채움 · ${image.originalName}`;

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
    element.setImage(state.images[definition.id]);
    element.toggleAttribute('tweak-mode', tweakMode);
    element.toggleAttribute('data-selected', tweakMode && definition.id === selectedId);
  }

  stage.style.transform = `scale(${zoom})`;
  stageShell.style.width = `${STAGE_WIDTH * zoom}px`;
  stageShell.style.height = `${STAGE_HEIGHT * zoom}px`;

  const definition = getSlotDefinition(selectedId);
  const rect = state.geometry[selectedId];
  selectedSlotLabel.textContent = definition.label;
  selectedSlotRect.textContent = formatRect(rect);
  slotSelect.value = selectedId;
  slotDescription.textContent = `${definition.description} · 현재 ${rect.width}×${rect.height}px`;
  slotDownloadName.textContent = definition.downloadName;

  geometryInputs.x.value = String(rect.x);
  geometryInputs.y.value = String(rect.y);
  geometryInputs.width.value = String(rect.width);
  geometryInputs.height.value = String(rect.height);
  geometryFieldset.disabled = !tweakMode;
  partsFieldset.disabled = !tweakMode;

  const partsOffset = getPartsOffset(state.geometry);
  partsXInput.value = String(partsOffset.x);
  partsYInput.value = String(partsOffset.y);
  partsJson.textContent = serializePortraitPartsManifest(state.geometry);

  const hasSelectedImage = state.images[selectedId] !== undefined;
  downloadSelectedImageButton.disabled = !hasSelectedImage;
  clearSelectedImageButton.disabled = !hasSelectedImage;

  renderAssetList();
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
    withSlotImage(state, detail.slotId, detail.image),
    `${getSlotDefinition(detail.slotId).label} PNG 저장됨`,
  );
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

chooseSelectedImageButton.addEventListener('click', () => {
  imageSlotElements.get(selectedId)?.chooseFile();
});

downloadSelectedImageButton.addEventListener('click', () => {
  downloadSlotImage(selectedId);
});

clearSelectedImageButton.addEventListener('click', () => {
  commit(
    withoutSlotImage(state, selectedId),
    `${getSlotDefinition(selectedId).label} 이미지 비움`,
  );
});

geometryFieldset.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
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
    commit(
      withSlotRect(
        state,
        selectedId,
        patchRect(state.geometry[selectedId], { [field]: value }),
      ),
      `${getSlotDefinition(selectedId).label} 좌표 입력`,
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
  commit(resetAllGeometry(state), '13개 슬롯 기본 좌표 복원');
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
  selectedId = 'portrait-parts';
  commit(
    withPartsOffset(
      state,
      axis === 'x' ? offset.x + delta : offset.x,
      axis === 'y' ? offset.y + delta : offset.y,
    ),
    '표정 파츠 오프셋 조정',
  );
});

function applyPartsInputs(): void {
  const x = Number(partsXInput.value);
  const y = Number(partsYInput.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    render();
    return;
  }
  selectedId = 'portrait-parts';
  commit(withPartsOffset(state, x, y), '표정 파츠 오프셋 입력');
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

function isRectField(value: string | undefined): value is keyof Rect {
  return value !== undefined && (RECT_FIELDS as readonly string[]).includes(value);
}

render();
if (storage !== undefined) setStatus('localStorage에서 워크벤치 상태를 불러왔습니다.');
