import { describe, expect, it, vi } from 'vitest';
import {
  FrameAnimation,
  assertFrameCycleLength,
  frameIndexAtElapsed,
} from '../../src/ui/core/frameAnimation';
import {
  bindSecondaryKeyboardInput,
  isEditableInputTarget,
  mapSecondaryKeyboardInput,
} from '../../src/ui/core/input';
import { calculateIntegerViewport } from '../../src/ui/core/integerScale';
import {
  createSceneStackState,
  reduceSceneStack,
} from '../../src/ui/core/sceneManager';

function keyboardEvent(code: string, repeat = false): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: repeat },
  });
  return event;
}

describe('integer stage geometry', () => {
  it.each([
    [640, 400, 1, 640, 400, 0, 0, true],
    [1920, 1080, 2, 1280, 800, 320, 140, true],
    [1280, 800, 2, 1280, 800, 0, 0, true],
    [2560, 1600, 2, 1280, 800, 640, 400, true],
    [1280, 900, 2, 1280, 800, 0, 50, true],
    [1280, 720, 1.8, 1152, 720, 64, 0, true],
    [1366, 768, 1.92, 1228.8, 768, 68, 0, true],
    [639, 399, 1, 640, 400, -1, -1, false],
  ])(
    'letterboxes %ix%i with a 2x ceiling and a fractional sub-800px fallback',
    (containerWidth, containerHeight, scale, width, height, offsetX, offsetY, fits) => {
      expect(calculateIntegerViewport(containerWidth, containerHeight)).toEqual({
        scale,
        width,
        height,
        offsetX,
        offsetY,
        fits,
      });
    },
  );
});

describe('secondary input mapping', () => {
  it('maps Space and the nine top-row number keys only', () => {
    expect(mapSecondaryKeyboardInput({ code: 'Space' })).toEqual({ type: 'ADVANCE' });
    expect(mapSecondaryKeyboardInput({ code: 'Digit1' })).toEqual({
      type: 'SELECT_CARD',
      cardNumber: 1,
    });
    expect(mapSecondaryKeyboardInput({ code: 'Digit9' })).toEqual({
      type: 'SELECT_CARD',
      cardNumber: 9,
    });
    expect(mapSecondaryKeyboardInput({ code: 'Digit0' })).toBeNull();
    expect(mapSecondaryKeyboardInput({ code: 'Numpad1' })).toBeNull();
    expect(mapSecondaryKeyboardInput({ code: 'Enter' })).toBeNull();
  });

  it('recognizes native and nested editable targets without requiring the DOM', () => {
    expect(isEditableInputTarget(null)).toBe(false);
    expect(
      isEditableInputTarget({ tagName: 'textarea' } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableInputTarget({ isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableInputTarget({ closest: () => ({}) } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableInputTarget({ tagName: 'BUTTON', closest: () => null } as unknown as EventTarget),
    ).toBe(false);
  });

  it('prevents handled input, ignores repeats, and cleans up idempotently', () => {
    const target = new EventTarget();
    const onCommand = vi.fn();
    const cleanup = bindSecondaryKeyboardInput(target, onCommand);

    const first = keyboardEvent('Digit2');
    expect(target.dispatchEvent(first)).toBe(false);
    expect(first.defaultPrevented).toBe(true);
    expect(onCommand).toHaveBeenCalledWith(
      { type: 'SELECT_CARD', cardNumber: 2 },
      first,
    );

    target.dispatchEvent(keyboardEvent('Space', true));
    target.dispatchEvent(keyboardEvent('KeyA'));
    expect(onCommand).toHaveBeenCalledTimes(1);

    cleanup();
    cleanup();
    target.dispatchEvent(keyboardEvent('Space'));
    expect(onCommand).toHaveBeenCalledTimes(1);
  });
});

describe('pure scene stack', () => {
  it('pushes and removes the requested overlay without mutating prior state', () => {
    const initial = createSceneStackState<string>();
    const withScene = reduceSceneStack(initial, { type: 'SET_SCENE', scene: 'main' });
    const first = reduceSceneStack(withScene, { type: 'PUSH_OVERLAY', overlay: 'dossier' });
    const second = reduceSceneStack(first, { type: 'PUSH_OVERLAY', overlay: 'help' });
    const removed = reduceSceneStack(second, {
      type: 'REMOVE_OVERLAY',
      overlay: 'dossier',
    });

    expect(initial).toEqual({ scene: null, overlays: [] });
    expect(second).toEqual({ scene: 'main', overlays: ['dossier', 'help'] });
    expect(removed).toEqual({ scene: 'main', overlays: ['help'] });
    expect(second.overlays).toEqual(['dossier', 'help']);
  });

  it('clears overlays when a scene changes and preserves an empty clear by identity', () => {
    const populated = {
      scene: 'old',
      overlays: ['dossier', 'help'],
    } as const;
    expect(reduceSceneStack(populated, { type: 'SET_SCENE', scene: 'new' })).toEqual({
      scene: 'new',
      overlays: [],
    });

    const empty = { scene: 'new', overlays: [] } as const;
    expect(reduceSceneStack(empty, { type: 'CLEAR_OVERLAYS' })).toBe(empty);
  });
});

describe('3-4 frame animation timing', () => {
  it('accepts only the prescribed spritesheet frame counts', () => {
    expect(() => assertFrameCycleLength(3)).not.toThrow();
    expect(() => assertFrameCycleLength(4)).not.toThrow();
    expect(() => assertFrameCycleLength(2)).toThrow(/3 or 4/u);
    expect(() => assertFrameCycleLength(5)).toThrow(/3 or 4/u);
  });

  it('cycles at exact fixed-duration boundaries and honours the initial index', () => {
    expect(frameIndexAtElapsed(0, 4, 100, 2)).toBe(2);
    expect(frameIndexAtElapsed(99, 4, 100, 2)).toBe(2);
    expect(frameIndexAtElapsed(100, 4, 100, 2)).toBe(3);
    expect(frameIndexAtElapsed(200, 4, 100, 2)).toBe(0);
    expect(frameIndexAtElapsed(400, 4, 100, 2)).toBe(2);
  });

  it('reports advance, seek, and reset samples without owning a clock', () => {
    const animation = new FrameAnimation(['a', 'b', 'c'], 50);

    expect(animation.advance(49)).toEqual({
      index: 0,
      frame: 'a',
      elapsedMs: 49,
      changed: false,
    });
    expect(animation.advance(1)).toMatchObject({ index: 1, frame: 'b', changed: true });
    expect(animation.seek(151)).toMatchObject({ index: 0, frame: 'a', elapsedMs: 151 });
    expect(animation.reset(2)).toEqual({
      index: 2,
      frame: 'c',
      elapsedMs: 0,
      changed: true,
    });
    expect(() => animation.advance(-1)).toThrow(/non-negative/u);
  });
});
