import {
  parsePngHeaderDimensions,
  validatePngDescriptor,
  validateSlotImageDimensions,
  type SlotImageState,
} from './model.mts';

export const IMAGE_SLOT_CHANGE_EVENT = 'image-slot-change';
export const IMAGE_SLOT_SELECT_EVENT = 'image-slot-select';

export interface ImageSlotChangeDetail {
  readonly slotId: string;
  readonly image: SlotImageState;
}

export interface ImageSlotSelectDetail {
  readonly slotId: string;
}

export function readPngAsDataUrl(file: File): Promise<string> {
  const validation = validatePngDescriptor(file);
  if (!validation.ok) return Promise.reject(new Error(validation.message));

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('PNG 파일을 data URL로 읽지 못했습니다.'));
        return;
      }
      resolve(reader.result);
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('PNG 파일 읽기에 실패했습니다.'));
    });
    reader.addEventListener('abort', () => {
      reject(new Error('PNG 파일 읽기가 취소되었습니다.'));
    });
    reader.readAsDataURL(file);
  });
}

async function readPngDimensions(file: File): Promise<Readonly<{ width: number; height: number }>> {
  const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  return parsePngHeaderDimensions(header);
}

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      position: absolute;
      box-sizing: border-box;
      border: 0;
      background:
        linear-gradient(135deg, rgba(242, 214, 142, 0.10) 25%, transparent 25%) 0 0 / 6px 6px,
        rgba(14, 12, 10, 0.48);
      color: #f2d68e;
      cursor: pointer;
      image-rendering: pixelated;
      outline: 1px dashed rgba(242, 214, 142, 0.74);
      outline-offset: -1px;
      outline: none;
      overflow: hidden;
    }

    :host(:hover),
    :host(:focus-visible) {
      outline-color: #ffe4a1;
      outline-style: solid;
      box-shadow: inset 0 0 0 1px rgba(255, 228, 161, 0.42);
    }

    :host([data-selected]) {
      outline: 2px solid #68dbe2;
      outline-offset: -2px;
      box-shadow: 0 0 0 2px #071519, 0 0 0 3px #68dbe2;
    }

    :host([tweak-mode]) {
      cursor: crosshair;
    }

    :host([data-over]) {
      outline: 2px solid #8ff09a;
      outline-offset: -2px;
      background: rgba(58, 126, 67, 0.44);
    }

    .frame,
    img,
    .empty,
    .error {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    img {
      display: none;
      object-fit: contain;
      image-rendering: pixelated;
      pointer-events: none;
    }

    .empty {
      display: grid;
      place-items: center;
      padding: 2px;
      overflow: hidden;
      color: currentColor;
      font: 700 7px/1.15 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: -0.03em;
      text-align: center;
      text-shadow: 0 1px #000;
      pointer-events: none;
    }

    :host([data-filled]) img {
      display: block;
    }

    :host([data-filled]) .empty {
      display: none;
    }

    .error {
      display: none;
      place-items: center;
      z-index: 2;
      padding: 3px;
      background: rgba(91, 20, 20, 0.94);
      color: #fff1d2;
      font: 700 7px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
      text-align: center;
      pointer-events: none;
    }

    :host([data-error]) .error {
      display: grid;
    }

    input {
      display: none;
    }
  </style>
  <div class="frame" part="frame">
    <img alt="" draggable="false" />
    <div class="empty" part="placeholder"></div>
    <div class="error" role="alert"></div>
  </div>
  <input type="file" accept="image/png,.png" tabindex="-1" />
`;

export class PlannerImageSlotElement extends HTMLElement {
  readonly #imageElement: HTMLImageElement;
  readonly #emptyElement: HTMLDivElement;
  readonly #errorElement: HTMLDivElement;
  readonly #inputElement: HTMLInputElement;
  #image: SlotImageState | undefined;
  #dragDepth = 0;
  #errorTimer: number | undefined;

  static get observedAttributes(): readonly string[] {
    return ['slot-label'];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(template.content.cloneNode(true));
    this.#imageElement = shadow.querySelector('img') as HTMLImageElement;
    this.#emptyElement = shadow.querySelector('.empty') as HTMLDivElement;
    this.#errorElement = shadow.querySelector('.error') as HTMLDivElement;
    this.#inputElement = shadow.querySelector('input') as HTMLInputElement;
  }

  connectedCallback(): void {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.setAttribute('role', 'button');
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
    this.addEventListener('dragenter', this.#onDragEnter);
    this.addEventListener('dragover', this.#onDragOver);
    this.addEventListener('dragleave', this.#onDragLeave);
    this.addEventListener('drop', this.#onDrop);
    this.#inputElement.addEventListener('change', this.#onInputChange);
    this.#render();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
    this.removeEventListener('dragenter', this.#onDragEnter);
    this.removeEventListener('dragover', this.#onDragOver);
    this.removeEventListener('dragleave', this.#onDragLeave);
    this.removeEventListener('drop', this.#onDrop);
    this.#inputElement.removeEventListener('change', this.#onInputChange);
    if (this.#errorTimer !== undefined) window.clearTimeout(this.#errorTimer);
  }

  attributeChangedCallback(): void {
    this.#render();
  }

  get slotId(): string {
    return this.dataset.slotId ?? '';
  }

  get slotLabel(): string {
    return this.getAttribute('slot-label') ?? this.slotId;
  }

  get imageValue(): SlotImageState | undefined {
    return this.#image;
  }

  setImage(image: SlotImageState | undefined): void {
    this.#image = image === undefined ? undefined : { ...image };
    this.#render();
  }

  chooseFile(): void {
    this.#inputElement.click();
  }

  #render(): void {
    const label = this.slotLabel;
    this.#emptyElement.textContent = label;
    this.#imageElement.alt = this.#image === undefined ? '' : `${label} 미리보기`;
    this.#imageElement.src = this.#image?.dataUrl ?? '';
    this.toggleAttribute('data-filled', this.#image !== undefined);
    this.setAttribute(
      'aria-label',
      `${label}: ${this.#image === undefined ? 'PNG 놓기 또는 선택' : 'PNG 교체'}`,
    );
    this.title = `${label} · PNG 드롭/선택`;
  }

  #dispatchSelection(): void {
    this.dispatchEvent(
      new CustomEvent<ImageSlotSelectDetail>(IMAGE_SLOT_SELECT_EVENT, {
        bubbles: true,
        composed: true,
        detail: { slotId: this.slotId },
      }),
    );
  }

  readonly #onClick = (): void => {
    this.#dispatchSelection();
    if (!this.hasAttribute('tweak-mode')) this.chooseFile();
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.#dispatchSelection();
    if (!this.hasAttribute('tweak-mode')) this.chooseFile();
  };

  readonly #onDragEnter = (event: DragEvent): void => {
    event.preventDefault();
    this.#dragDepth += 1;
    this.setAttribute('data-over', '');
  };

  readonly #onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
  };

  readonly #onDragLeave = (): void => {
    this.#dragDepth = Math.max(0, this.#dragDepth - 1);
    if (this.#dragDepth === 0) this.removeAttribute('data-over');
  };

  readonly #onDrop = (event: DragEvent): void => {
    event.preventDefault();
    this.#dragDepth = 0;
    this.removeAttribute('data-over');
    this.#dispatchSelection();
    const file = event.dataTransfer?.files.item(0);
    if (file !== null && file !== undefined) void this.#ingest(file);
  };

  readonly #onInputChange = (): void => {
    const file = this.#inputElement.files?.item(0);
    this.#inputElement.value = '';
    if (file !== null && file !== undefined) void this.#ingest(file);
  };

  async #ingest(file: File): Promise<void> {
    try {
      const dimensions = await readPngDimensions(file);
      const dimensionValidation = validateSlotImageDimensions(this.slotId, dimensions);
      if (!dimensionValidation.ok) throw new Error(dimensionValidation.message);
      const dataUrl = await readPngAsDataUrl(file);
      const image = { dataUrl, originalName: file.name } satisfies SlotImageState;
      this.#image = image;
      this.#render();
      this.dispatchEvent(
        new CustomEvent<ImageSlotChangeDetail>(IMAGE_SLOT_CHANGE_EVENT, {
          bubbles: true,
          composed: true,
          detail: { slotId: this.slotId, image },
        }),
      );
    } catch (error) {
      this.#showError(error instanceof Error ? error.message : String(error));
    }
  }

  #showError(message: string): void {
    this.#errorElement.textContent = message;
    this.setAttribute('data-error', '');
    if (this.#errorTimer !== undefined) window.clearTimeout(this.#errorTimer);
    this.#errorTimer = window.setTimeout(() => {
      this.removeAttribute('data-error');
      this.#errorTimer = undefined;
    }, 3200);
  }
}

if (!customElements.get('image-slot')) {
  customElements.define('image-slot', PlannerImageSlotElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'image-slot': PlannerImageSlotElement;
  }
}
