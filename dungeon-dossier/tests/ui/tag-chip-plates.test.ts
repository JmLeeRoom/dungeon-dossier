import { Graphics, Sprite, type FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer();
      Object.defineProperties(view, {
        anchor: { value: { x: 0, y: 0, set(): void {} } },
        text: { value: text, writable: true },
        tint: { value: 0xffffff, writable: true },
      });
      return view;
    },
  };
});

import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { preservesAspect } from '../../src/ui/core/imageFit';
import {
  TAG_CHIP_ASSET_KEYS,
  TAG_CHIP_SIZE,
  TAG_CHIP_STATES,
  TAG_PLATE_SOURCE,
  createTagChip,
} from '../../src/ui/widgets/tagChip';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const resolveUrl = (): string => WHITE_TEXTURE_URL;

function visiblePlates(view: { children: readonly { visible: boolean }[] }): number {
  return view.children.filter((child) => child instanceof Sprite && child.visible).length;
}

describe('statement tag plates', () => {
  it('publishes the four claim states plus the two display-only ones', () => {
    expect(TAG_CHIP_STATES).toEqual([
      'DEFAULT',
      'SHIELDED',
      'BROKEN',
      'SHAKEN',
      'HIDDEN_SLOT',
      'DEACTIVATED',
    ]);
    expect(TAG_PLATE_SOURCE).toEqual(ASSET_DIMENSIONS.tag_830x330);
  });

  it('sizes the chip aspect-true to the authored 830x330 plate', () => {
    expect(TAG_CHIP_SIZE).toEqual({ width: 98, height: 39 });
    expect(preservesAspect(TAG_PLATE_SOURCE, TAG_CHIP_SIZE, 0.01)).toBe(true);
    // The 98x26 the vector chip used is 12% off and would visibly squash it.
    expect(preservesAspect(TAG_PLATE_SOURCE, { width: 98, height: 26 }, 0.01)).toBe(false);
  });

  it('shows exactly one plate at a time and swaps it on a state change', () => {
    const chip = createTagChip('WHO', 'DEFAULT', { resolveUrl });
    expect(visiblePlates(chip.view)).toBe(1);

    for (const state of TAG_CHIP_STATES) {
      chip.setState(state);
      expect(chip.state, state).toBe(state);
      // SHAKEN has no authored plate, so it falls back to the vector chip.
      expect(visiblePlates(chip.view), state).toBe(
        TAG_CHIP_ASSET_KEYS[state] === undefined ? 0 : 1,
      );
    }
    chip.view.destroy({ children: true });
  });

  it('keeps the selection outline in the code layer on every plate', () => {
    const chip = createTagChip('WHEN', 'SHIELDED', { resolveUrl });
    const plate = chip.view.children.find((child) => child instanceof Graphics);
    if (!(plate instanceof Graphics)) throw new Error('Expected the vector plate layer.');

    expect(plate.bounds.width).toBe(0);
    chip.setSelected(true);
    // Selection is drawn by code so it reads identically over every plate.
    expect(plate.bounds.width).toBeGreaterThan(0);
    chip.setSelected(false);
    expect(plate.bounds.width).toBe(0);

    chip.view.destroy({ children: true });
  });

  it('keeps the plate sprites out of the input path', () => {
    const chip = createTagChip('WHY', 'DEFAULT', { resolveUrl, onSelect: () => undefined });
    expect(chip.view.eventMode).toBe('static');
    for (const child of chip.view.children) {
      if (child instanceof Sprite) expect(child.eventMode).toBe('none');
    }
    chip.view.destroy({ children: true });
  });

  it('keeps hidden and deactivated slots out of every input path', () => {
    const onSelect = vi.fn();
    const chip = createTagChip('WHERE', 'HIDDEN_SLOT', { resolveUrl, onSelect });
    expect(chip.view.eventMode).toBe('none');
    chip.view.emit('pointertap', {} as FederatedPointerEvent);
    expect(onSelect).not.toHaveBeenCalled();

    chip.setState('DEFAULT');
    expect(chip.view.eventMode).toBe('static');
    chip.view.emit('pointertap', {} as FederatedPointerEvent);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('WHERE');

    chip.setState('DEACTIVATED');
    expect(chip.view.eventMode).toBe('none');
    chip.view.emit('pointertap', {} as FederatedPointerEvent);
    expect(onSelect).toHaveBeenCalledOnce();
    chip.view.destroy({ children: true });
  });

  it('renders the vector chip unchanged when no plate resolves', () => {
    const chip = createTagChip('WHAT', 'BROKEN');
    expect(chip.view.children.filter((child) => child instanceof Sprite)).toHaveLength(0);
    const plate = chip.view.children.find((child) => child instanceof Graphics);
    expect(plate instanceof Graphics && plate.bounds.width).toBeGreaterThan(0);
    chip.view.destroy({ children: true });
  });
});
