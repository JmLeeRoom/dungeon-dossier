import { Container } from 'pixi.js';
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

import { createSceneShake, dampedShakeOffset } from '../../src/ui/core/shake';
import {
  PORTRAIT_SHAKE_PROFILES,
  createPortrait,
  portraitShakeOffset,
} from '../../src/ui/widgets/portrait';

const PROFILE = { durationMs: 400, amplitude: 10, oscillations: 5 } as const;

describe('damped shake curve', () => {
  it('starts and ends at rest and never leaves a fractional pixel', () => {
    expect(dampedShakeOffset(0, PROFILE)).toBe(0);
    expect(dampedShakeOffset(400, PROFILE)).toBe(0);
    expect(dampedShakeOffset(9_999, PROFILE)).toBe(0);
    expect(dampedShakeOffset(-1, PROFILE)).toBe(0);
    expect(dampedShakeOffset(Number.NaN, PROFILE)).toBe(0);

    for (let ms = 0; ms <= 400; ms += 1) {
      const offset = dampedShakeOffset(ms, PROFILE);
      expect(Number.isInteger(offset), `${ms}ms`).toBe(true);
      expect(Object.is(offset, -0), `${ms}ms must not be a signed zero`).toBe(false);
      expect(Math.abs(offset)).toBeLessThanOrEqual(PROFILE.amplitude);
    }
  });

  it('decays: the last quarter never swings wider than the first', () => {
    const swing = (from: number): number =>
      Math.max(
        ...Array.from({ length: 100 }, (_, ms) => Math.abs(dampedShakeOffset(from + ms, PROFILE))),
      );
    expect(swing(300)).toBeLessThan(swing(0));
  });

  it('treats a zero-length profile as no shake at all', () => {
    expect(dampedShakeOffset(10, { durationMs: 0, amplitude: 10, oscillations: 5 })).toBe(0);
  });
});

describe('portrait transition profiles', () => {
  it('hits the specified +-10px for upset and escalates for lose', () => {
    expect(PORTRAIT_SHAKE_PROFILES.upset).toEqual({
      durationMs: 400,
      amplitude: 10,
      oscillations: 5,
    });
    expect(PORTRAIT_SHAKE_PROFILES.lose.amplitude).toBeGreaterThan(
      PORTRAIT_SHAKE_PROFILES.upset.amplitude,
    );
    expect(PORTRAIT_SHAKE_PROFILES.lose.durationMs).toBeGreaterThan(
      PORTRAIT_SHAKE_PROFILES.upset.durationMs,
    );

    const upsetPeak = Math.max(
      ...Array.from({ length: 400 }, (_, ms) => Math.abs(portraitShakeOffset(ms, 'upset'))),
    );
    const losePeak = Math.max(
      ...Array.from({ length: 550 }, (_, ms) => Math.abs(portraitShakeOffset(ms, 'lose'))),
    );
    expect(upsetPeak).toBe(PORTRAIT_SHAKE_PROFILES.upset.amplitude - 1);
    expect(losePeak).toBeGreaterThan(upsetPeak);
    expect(portraitShakeOffset(400, 'upset')).toBe(0);
    expect(portraitShakeOffset(550, 'lose')).toBe(0);
  });
});

describe('scene shake controller', () => {
  it('captures the resting x on play and restores it exactly', () => {
    const target = new Container();
    target.position.set(212, 34);
    const shake = createSceneShake(target, PROFILE);

    expect(shake.active).toBe(false);
    shake.play();
    expect(shake.active).toBe(true);

    shake.update(40);
    expect(target.position.x).toBe(212 + dampedShakeOffset(40, PROFILE));
    expect(target.position.x).not.toBe(212);
    expect(target.position.y).toBe(34);

    shake.update(PROFILE.durationMs);
    expect(shake.active).toBe(false);
    expect(target.position.x).toBe(212);
  });

  it('re-baselines instead of compounding when replayed mid-shake', () => {
    const target = new Container();
    target.position.set(100, 0);
    const shake = createSceneShake(target, PROFILE);

    shake.play();
    shake.update(40);
    expect(target.position.x).not.toBe(100);

    shake.play();
    expect(shake.elapsedMs).toBe(0);
    expect(target.position.x).toBe(100);

    shake.update(PROFILE.durationMs);
    expect(target.position.x).toBe(100);
  });

  it('releases to rest even if it never ran to completion', () => {
    const target = new Container();
    target.position.set(50, 0);
    const shake = createSceneShake(target, PROFILE);

    shake.play();
    shake.update(40);
    shake.release();

    expect(shake.active).toBe(false);
    expect(target.position.x).toBe(50);
  });

  it('is a no-op without a target', () => {
    const shake = createSceneShake(undefined, PROFILE);
    shake.play();
    expect(() => shake.update(40)).not.toThrow();
    shake.release();
    expect(shake.active).toBe(false);
  });
});

describe('portrait controller shake', () => {
  it('shakes around wherever the screen placed the portrait', () => {
    const portrait = createPortrait({ statePart: 'base' });
    portrait.view.position.set(212, 34);

    expect(portrait.shaking).toBe(false);
    portrait.playTransitionShake('upset');
    expect(portrait.shaking).toBe(true);

    portrait.update(40);
    expect(portrait.view.position.x).toBe(212 + portraitShakeOffset(40, 'upset'));

    portrait.update(400);
    expect(portrait.shaking).toBe(false);
    expect(portrait.view.position.x).toBe(212);

    portrait.view.destroy({ children: true });
  });

  it('swaps to the lose profile when the suspect breaks', () => {
    const portrait = createPortrait({ statePart: 'upset' });
    portrait.view.position.set(0, 0);

    portrait.playTransitionShake('lose');
    portrait.update(400);
    // The upset profile would already be finished at 400ms.
    expect(portrait.shaking).toBe(true);

    portrait.update(150);
    expect(portrait.shaking).toBe(false);
    expect(portrait.view.position.x).toBe(0);

    portrait.view.destroy({ children: true });
  });

  it('restarts cleanly when a second transition lands mid-shake', () => {
    const portrait = createPortrait({ statePart: 'base' });
    portrait.view.position.set(212, 34);

    portrait.playTransitionShake('upset');
    portrait.update(40);
    portrait.playTransitionShake('lose');
    expect(portrait.view.position.x).toBe(212);

    portrait.update(PORTRAIT_SHAKE_PROFILES.lose.durationMs);
    expect(portrait.view.position.x).toBe(212);
    expect(portrait.shaking).toBe(false);

    portrait.view.destroy({ children: true });
  });
});
