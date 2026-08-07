import { Container, Sprite, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer() as Container & {
        anchor: Readonly<{ set(x: number, y?: number): void }>;
        text: string;
      };
      Object.defineProperties(view, {
        anchor: { value: { set: () => undefined } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import {
  DEFAULT_SUSPECT_STATE_PARTS_BOUNDS,
  PARTNER_PORTRAIT_SIZE,
  PORTRAIT_SOURCE_DIMENSIONS,
  SUSPECT_PORTRAIT_SIZE,
  createPartnerPortrait,
  createPortrait,
} from '../../src/ui/widgets/portrait';

type EventEmitter = Readonly<{
  emit(event: string, ...arguments_: unknown[]): boolean;
}>;

function emit(target: Container, event: string): void {
  (target as unknown as EventEmitter).emit(event);
}

// The widget API accepts resolved URLs. A pre-created Pixi texture exercises
// the same Sprite.from branch without starting an asynchronous asset request.
const WHITE_TEXTURE_URL = Texture.WHITE as unknown as string;

describe('portrait widget rendering', () => {
  it('composites 512x512 source sheets into the exact suspect display bounds', () => {
    expect(PORTRAIT_SOURCE_DIMENSIONS).toEqual({
      base: { width: 512, height: 512 },
      stateParts: { width: 512, height: 512 },
      partner: { width: 512, height: 512 },
    });
    expect(SUSPECT_PORTRAIT_SIZE).toEqual({ width: 216, height: 216 });
    expect(DEFAULT_SUSPECT_STATE_PARTS_BOUNDS).toEqual({
      x: 0,
      y: 0,
      width: 216,
      height: 216,
    });

    const portrait = createPortrait({
      statePart: 'upset',
      baseUrl: WHITE_TEXTURE_URL,
      statePartsUrl: WHITE_TEXTURE_URL,
    });
    const base = portrait.view.children[1];
    const parts = portrait.view.children[2];
    expect(portrait.statePart).toBe('upset');
    expect(base).toBeInstanceOf(Sprite);
    expect(parts).toBeInstanceOf(Sprite);
    expect(base).toMatchObject({ width: 216, height: 216 });
    expect(parts).toMatchObject({ width: 216, height: 216 });
    expect(parts?.position).toMatchObject({ x: 0, y: 0 });

    portrait.view.destroy({ children: true });
  });

  it('keeps a readable state overlay when authored state-parts art is unavailable', () => {
    const base = createPortrait({ statePart: 'base' });
    const upset = createPortrait({ statePart: 'upset' });
    const lose = createPortrait({ statePart: 'lose' });

    // Placeholder + optional state wash + fallback label.
    expect(base.view.children).toHaveLength(2);
    expect(upset.view.children).toHaveLength(3);
    expect(lose.view.children).toHaveLength(3);

    base.view.destroy({ children: true });
    upset.view.destroy({ children: true });
    lose.view.destroy({ children: true });
  });
});

describe('partner portrait cooldown rendering', () => {
  it('switches base/used art, centers the countdown, and rearms at zero', () => {
    const onUse = vi.fn();
    const partner = createPartnerPortrait({
      label: '김 인턴',
      baseUrl: WHITE_TEXTURE_URL,
      usedUrl: WHITE_TEXTURE_URL,
      cooldown: { state: 'used', cooldownTurns: 2 },
      onUse,
    });

    expect(PARTNER_PORTRAIT_SIZE).toEqual({ width: 88, height: 88 });
    expect(partner.cooldown).toEqual({ state: 'used', cooldownTurns: 2 });
    const artwork = partner.view.children[0];
    const dim = partner.view.children[1];
    const countdown = partner.view.children[2] as Container & { text: string };
    if (!(artwork instanceof Container)) throw new Error('Expected partner artwork.');
    const basePortrait = artwork.children[0];
    const usedPortrait = artwork.children[1];
    expect(basePortrait?.visible).toBe(false);
    expect(usedPortrait?.visible).toBe(true);
    expect(artwork.alpha).toBe(0.7);
    expect(dim?.visible).toBe(true);
    expect(countdown.visible).toBe(true);
    expect(countdown.text).toBe('2');
    expect(countdown.position).toMatchObject({ x: 44, y: 44 });
    expect(partner.view.eventMode).toBe('none');

    emit(partner.view, 'pointertap');
    expect(onUse).not.toHaveBeenCalled();

    partner.setCooldown({ state: 'used', cooldownTurns: 0 });
    expect(partner.cooldown).toEqual({ state: 'base', cooldownTurns: 0 });
    expect(basePortrait?.visible).toBe(true);
    expect(usedPortrait?.visible).toBe(false);
    expect(artwork.alpha).toBe(1);
    expect(dim?.visible).toBe(false);
    expect(countdown.visible).toBe(false);
    expect(countdown.text).toBe('');
    expect(partner.view.eventMode).toBe('static');
    expect(partner.view.cursor).toBe('pointer');

    emit(partner.view, 'pointertap');
    expect(onUse).toHaveBeenCalledOnce();

    partner.setCooldown({ state: 'used', cooldownTurns: 3 });
    emit(partner.view, 'pointertap');
    expect(onUse).toHaveBeenCalledOnce();

    partner.view.destroy({ children: true });
  });
});
