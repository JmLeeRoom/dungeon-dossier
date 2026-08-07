import { Container, Graphics } from 'pixi.js';
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
  PUNISH_TIMELINE,
  createPulseRings,
  createPunishJuice,
  punishDimAlpha,
  punishFloatState,
  punishRingState,
  punishShakeOffset,
} from '../../src/ui/screens/interrogation/punishJuice';

const STAGE = { width: 640, height: 400 } as const;
const ANCHOR = { x: 334, y: 13 } as const;

describe('punish timeline curves', () => {
  it('fades the red wash from its peak to nothing in 300ms', () => {
    expect(punishDimAlpha(0)).toBe(0);
    expect(punishDimAlpha(1)).toBeCloseTo(PUNISH_TIMELINE.dimPeakAlpha, 2);
    expect(punishDimAlpha(150)).toBeCloseTo(PUNISH_TIMELINE.dimPeakAlpha / 2, 5);
    expect(punishDimAlpha(300)).toBe(0);
    expect(punishDimAlpha(900)).toBe(0);
    expect(punishDimAlpha(Number.NaN)).toBe(0);
  });

  it('damps the shake to zero and never emits a fractional pixel', () => {
    expect(punishShakeOffset(0)).toBe(0);
    expect(punishShakeOffset(300)).toBe(0);
    expect(punishShakeOffset(900)).toBe(0);
    expect(punishShakeOffset(-5)).toBe(0);

    let peak = 0;
    for (let ms = 0; ms <= 300; ms += 1) {
      const offset = punishShakeOffset(ms);
      expect(Number.isInteger(offset), `offset at ${ms}ms`).toBe(true);
      expect(Math.abs(offset)).toBeLessThanOrEqual(PUNISH_TIMELINE.shakeAmplitude);
      peak = Math.max(peak, Math.abs(offset));
    }
    expect(peak).toBeGreaterThan(0);

    // Late oscillations must be weaker than early ones.
    const early = Math.max(
      ...Array.from({ length: 60 }, (_, ms) => Math.abs(punishShakeOffset(ms))),
    );
    const late = Math.max(
      ...Array.from({ length: 60 }, (_, ms) => Math.abs(punishShakeOffset(240 + ms))),
    );
    expect(late).toBeLessThan(early);
  });

  it('phase-shifts the rings so the pulse never fully goes dark mid-flight', () => {
    expect(punishRingState(0, 0)).toEqual({ scale: 1, alpha: PUNISH_TIMELINE.ringPeakAlpha });
    expect(punishRingState(600, 0).alpha).toBe(0);
    expect(punishRingState(-1, 0).alpha).toBe(0);

    for (let ms = 10; ms < PUNISH_TIMELINE.ringDurationMs; ms += 10) {
      const brightest = Math.max(
        punishRingState(ms, 0).alpha,
        punishRingState(ms, 1).alpha,
      );
      expect(brightest, `rings at ${ms}ms`).toBeGreaterThan(0);
    }

    const midway = punishRingState(150, 0);
    expect(midway.scale).toBeGreaterThan(1);
    expect(midway.scale).toBeLessThanOrEqual(PUNISH_TIMELINE.ringMaxScale);
  });

  it('holds the floating number, then rises and fades it on whole pixels', () => {
    expect(punishFloatState(0)).toEqual({ offsetY: 0, alpha: 0 });
    expect(punishFloatState(99).alpha).toBe(0);
    expect(punishFloatState(100)).toEqual({ offsetY: 0, alpha: 1 });
    expect(punishFloatState(500).alpha).toBe(1);
    expect(punishFloatState(700).alpha).toBeGreaterThan(0);
    expect(punishFloatState(700).alpha).toBeLessThan(1);
    expect(punishFloatState(900)).toEqual({
      offsetY: -PUNISH_TIMELINE.floatRiseY,
      alpha: 0,
    });

    for (let ms = 100; ms <= 900; ms += 25) {
      expect(Number.isInteger(punishFloatState(ms).offsetY), `${ms}ms`).toBe(true);
    }
  });
});

describe('shared pulse rings', () => {
  it('draws one ring per configured count and reports when it is finished', () => {
    const rings = createPulseRings({ count: 3, radius: 12 });

    expect(rings.view.children).toHaveLength(3);
    expect(rings.view.children.every((child) => child instanceof Graphics)).toBe(true);

    rings.setCentre(100, 50);
    expect(rings.view.position).toMatchObject({ x: 100, y: 50 });

    expect(rings.update(120)).toBe(true);
    expect(rings.view.visible).toBe(true);
    expect(rings.update(PUNISH_TIMELINE.ringDurationMs)).toBe(false);
    expect(rings.view.visible).toBe(false);

    rings.view.destroy({ children: true });
  });
});

describe('punish juice controller', () => {
  function setup() {
    const shakeTarget = new Container();
    shakeTarget.position.set(12, 0);
    const pulseTarget = new Container();
    const juice = createPunishJuice(STAGE, { shakeTarget, pulseTarget });
    return { juice, shakeTarget, pulseTarget };
  }

  it('ignores a non-positive delta so recovery never reads as punishment', () => {
    const { juice, shakeTarget } = setup();

    juice.play(0, ANCHOR);
    expect(juice.active).toBe(false);
    juice.play(-4, ANCHOR);
    expect(juice.active).toBe(false);
    expect(juice.view.visible).toBe(false);
    expect(shakeTarget.position.x).toBe(12);

    juice.destroy();
  });

  it('runs the full timeline and restores the scene position exactly', () => {
    const { juice, shakeTarget, pulseTarget } = setup();

    juice.play(15, ANCHOR);
    expect(juice.active).toBe(true);
    expect(juice.view.visible).toBe(true);

    const dim = juice.view.children[0];
    if (!(dim instanceof Graphics)) throw new Error('Expected the dim plate first.');

    juice.update(0);
    expect(dim.alpha).toBe(0);
    expect(shakeTarget.position.x).toBe(12);

    // 125ms is an oscillation peak; the multiples of 50ms are all zero
    // crossings of the damped sine.
    juice.update(125);
    expect(dim.alpha).toBeCloseTo(PUNISH_TIMELINE.dimPeakAlpha * (1 - 125 / 300), 5);
    expect(punishShakeOffset(125)).not.toBe(0);
    expect(shakeTarget.position.x).toBe(12 + punishShakeOffset(125));
    expect(Number.isInteger(shakeTarget.position.x)).toBe(true);
    expect(pulseTarget.tint).not.toBe(0xff_ff_ff);

    juice.update(175);
    expect(dim.alpha).toBe(0);
    expect(shakeTarget.position.x).toBe(12);
    expect(juice.active).toBe(true);

    juice.update(600);
    expect(juice.active).toBe(false);
    expect(juice.view.visible).toBe(false);
    expect(shakeTarget.position.x).toBe(12);
    expect(pulseTarget.tint).toBe(0xff_ff_ff);

    juice.destroy();
  });

  it('renders the signed delta with the coercion label and clears it at the end', () => {
    const shakeTarget = new Container();
    const juice = createPunishJuice(STAGE, { shakeTarget, resourceLabel: '강압' });

    juice.play(15, ANCHOR);
    const float = juice.view.children.at(-1) as Container & { text?: string };
    expect(float.text).toBe('+15 강압');
    expect(float.position).toMatchObject({
      x: ANCHOR.x,
      y: ANCHOR.y + PUNISH_TIMELINE.floatStartOffsetY,
    });

    juice.update(300);
    expect(float.position.y).toBeLessThan(ANCHOR.y + PUNISH_TIMELINE.floatStartOffsetY);

    juice.update(PUNISH_TIMELINE.totalMs);
    expect(juice.view.children.some((child) => child === float)).toBe(false);

    juice.destroy();
  });

  it('restarts cleanly when a second spike lands mid-animation', () => {
    const { juice, shakeTarget } = setup();

    juice.play(5, ANCHOR);
    juice.update(125);
    expect(shakeTarget.position.x).not.toBe(12);

    juice.play(15, ANCHOR);
    expect(juice.elapsedMs).toBe(0);
    // The restart has to hand back an unshaken base, or the offset compounds.
    expect(shakeTarget.position.x).toBe(12);

    juice.update(PUNISH_TIMELINE.totalMs);
    expect(juice.active).toBe(false);
    expect(shakeTarget.position.x).toBe(12);

    juice.destroy();
  });

  it('leaves the scene un-shaken when destroyed mid-animation', () => {
    const { juice, shakeTarget } = setup();

    juice.play(15, ANCHOR);
    juice.update(120);
    juice.destroy();

    expect(shakeTarget.position.x).toBe(12);
  });

  it('never intercepts pointer input', () => {
    const { juice } = setup();
    expect(juice.view.eventMode).toBe('none');
    juice.destroy();
  });
});
