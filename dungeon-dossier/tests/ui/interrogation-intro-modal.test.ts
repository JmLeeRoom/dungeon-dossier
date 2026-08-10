import type { Container, FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer() as Container & { text: string };
      Object.defineProperties(view, {
        anchor: { value: { set: () => undefined } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import {
  DEFAULT_INTERROGATION_INTRO_BODY,
  DEFAULT_INTERROGATION_INTRO_TITLE,
  INTERROGATION_INTRO_STAGE,
  createInterrogationIntroModal,
} from '../../src/ui/screens/interrogation/introModal';

function keyboardEvent(code: string, repeat = false): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: repeat },
  });
  return event;
}

function childWithLabel(root: Container, label: string): Container {
  const queue: Container[] = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current.label === label) return current;
    queue.push(...current.children);
  }
  throw new Error(`Missing child with label ${label}.`);
}

describe('interrogation intro modal', () => {
  it('owns the full 640x400 stage and renders the authored briefing controls', () => {
    const modal = createInterrogationIntroModal({
      onStart: () => undefined,
      inputTarget: new EventTarget(),
    });

    expect(INTERROGATION_INTRO_STAGE).toEqual({ width: 640, height: 400 });
    expect(modal.view.label).toBe('interrogation-intro-modal');
    expect(modal.view.hitArea).toMatchObject({ x: 0, y: 0, width: 640, height: 400 });
    expect(childWithLabel(modal.view, 'interrogation-intro-input-blocker')).toBeDefined();
    expect(childWithLabel(modal.view, 'interrogation-intro-briefing-panel')).toBeDefined();
    expect(childWithLabel(modal.view, 'interrogation-intro-body')).toMatchObject({
      text: DEFAULT_INTERROGATION_INTRO_BODY,
    });
    expect(childWithLabel(modal.view, 'interrogation-intro-start-button').cursor).toBe('pointer');
    expect(DEFAULT_INTERROGATION_INTRO_TITLE).toBe('[사건 브리핑]');

    modal.destroy();
    modal.view.destroy({ children: true });
  });

  it('starts from Enter, Space, or the button but invokes onStart only once', () => {
    const inputTarget = new EventTarget();
    const onStart = vi.fn();
    const modal = createInterrogationIntroModal({ onStart, inputTarget });

    const enter = keyboardEvent('Enter');
    inputTarget.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
    expect(modal.started).toBe(true);

    const button = childWithLabel(modal.view, 'interrogation-intro-start-button');
    button.emit(
      'pointertap',
      { stopPropagation: vi.fn() } as unknown as FederatedPointerEvent,
    );
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onStart).toHaveBeenCalledOnce();

    modal.destroy();
    modal.view.destroy({ children: true });
  });

  it('drops held keys and removes its global listener when destroyed', () => {
    const inputTarget = new EventTarget();
    const onStart = vi.fn();
    const modal = createInterrogationIntroModal({ onStart, inputTarget });

    inputTarget.dispatchEvent(keyboardEvent('Space', true));
    inputTarget.dispatchEvent(keyboardEvent('Escape'));
    expect(onStart).not.toHaveBeenCalled();

    modal.destroy();
    modal.destroy();
    inputTarget.dispatchEvent(keyboardEvent('NumpadEnter'));
    expect(onStart).not.toHaveBeenCalled();
    expect(modal.view.eventMode).toBe('none');
    modal.view.destroy({ children: true });
  });
});
