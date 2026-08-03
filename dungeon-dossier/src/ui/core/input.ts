export type SecondaryInputCommand =
  | Readonly<{ type: 'ADVANCE' }>
  | Readonly<{ type: 'SELECT_CARD'; cardNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }>;

export interface KeyboardEventLike {
  readonly code: string;
  readonly repeat?: boolean;
}

export interface SecondaryKeyboardOptions {
  /** Repeated keydown events are ignored by default. */
  readonly allowRepeat?: boolean;
  /** Text inputs and contenteditable controls are ignored by default. */
  readonly allowInEditableTarget?: boolean;
  readonly capture?: boolean;
}

export function mapSecondaryKeyboardInput(event: KeyboardEventLike): SecondaryInputCommand | null {
  if (event.code === 'Space') return { type: 'ADVANCE' };

  const match = /^Digit([1-9])$/u.exec(event.code);
  if (match?.[1] === undefined) return null;
  return {
    type: 'SELECT_CARD',
    cardNumber: Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  };
}

/** DOM-independent shape check, so injected EventTargets also work in tests. */
export function isEditableInputTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false;
  const candidate = target as EventTarget & {
    readonly tagName?: unknown;
    readonly isContentEditable?: unknown;
    closest?(selector: string): unknown;
  };
  if (candidate.isContentEditable === true) return true;

  const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;

  return candidate.closest?.('[contenteditable="true"]') != null;
}

/**
 * Attaches secondary keyboard controls to an injected target. The returned
 * cleanup function is idempotent and removes exactly this listener.
 */
export function bindSecondaryKeyboardInput(
  target: EventTarget,
  onCommand: (command: SecondaryInputCommand, event: Event) => void,
  options: SecondaryKeyboardOptions = {},
): () => void {
  const listener: EventListener = (event) => {
    if (!('code' in event) || typeof event.code !== 'string') return;
    const keyboardEvent = event as Event & KeyboardEventLike;
    if (keyboardEvent.repeat === true && options.allowRepeat !== true) return;
    if (options.allowInEditableTarget !== true && isEditableInputTarget(event.target)) return;

    const command = mapSecondaryKeyboardInput(keyboardEvent);
    if (command === null) return;
    event.preventDefault();
    onCommand(command, event);
  };

  const capture = options.capture ?? false;
  target.addEventListener('keydown', listener, capture);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener('keydown', listener, capture);
  };
}
