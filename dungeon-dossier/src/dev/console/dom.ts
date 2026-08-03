export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createButton(
  label: string,
  onClick: () => void,
  className = 'dev-button',
): HTMLButtonElement {
  const button = createElement('button', className, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

export function createPanelHeading(
  title: string,
  description: string,
): Readonly<{ view: HTMLDivElement; actions: HTMLDivElement }> {
  const view = createElement('div', 'dev-panel__heading');
  const copy = createElement('div');
  copy.append(createElement('h2', undefined, title), createElement('p', undefined, description));
  const actions = createElement('div', 'dev-panel__actions');
  view.append(copy, actions);
  return { view, actions };
}

export interface DevPanelController {
  readonly view: HTMLElement;
  refresh?(): void;
  destroy?(): void;
}
