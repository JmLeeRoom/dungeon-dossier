import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { createSceneShake, dampedShakeOffset, type ShakeProfile } from '../../core/shake';
import { UI_PALETTE } from '../../widgets';

/**
 * A ticker-driven overlay, never a scene transition: autoplay's watchdog only
 * watches for scene stalls, so juice that never mounts a scene cannot stall a
 * headless run or block an interaction.
 */
export const PUNISH_TIMELINE = {
  dimDurationMs: 300,
  dimPeakAlpha: 0.25,
  shakeDurationMs: 300,
  shakeAmplitude: 4,
  shakeOscillations: 6,
  ringDurationMs: 600,
  ringCycleMs: 300,
  ringCount: 2,
  ringMaxScale: 1.8,
  ringPeakAlpha: 0.8,
  floatDelayMs: 100,
  floatDurationMs: 800,
  floatRiseY: 24,
  floatStartOffsetY: 26,
  floatFadeStartMs: 500,
  totalMs: 900,
} as const;

export const PUNISH_DIM_COLOUR = 0xb0_30_30;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Full-screen red wash, brightest on impact. */
export function punishDimAlpha(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (elapsedMs >= PUNISH_TIMELINE.dimDurationMs) return 0;
  return PUNISH_TIMELINE.dimPeakAlpha * (1 - elapsedMs / PUNISH_TIMELINE.dimDurationMs);
}

export const PUNISH_SHAKE_PROFILE: ShakeProfile = {
  durationMs: PUNISH_TIMELINE.shakeDurationMs,
  amplitude: PUNISH_TIMELINE.shakeAmplitude,
  oscillations: PUNISH_TIMELINE.shakeOscillations,
};

/** Scene kick on a coercion spike. */
export function punishShakeOffset(elapsedMs: number): number {
  return dampedShakeOffset(elapsedMs, PUNISH_SHAKE_PROFILE);
}

export interface PulseRingState {
  readonly scale: number;
  readonly alpha: number;
}

/** Expanding rings, evenly phase-shifted so the pulse never goes dark. */
export function punishRingState(
  elapsedMs: number,
  ringIndex = 0,
  durationMs: number = PUNISH_TIMELINE.ringDurationMs,
  cycleMs: number = PUNISH_TIMELINE.ringCycleMs,
  ringCount: number = PUNISH_TIMELINE.ringCount,
): PulseRingState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= durationMs) {
    return { scale: 1, alpha: 0 };
  }
  const offset = (ringIndex % ringCount) / ringCount;
  const phase = ((elapsedMs / cycleMs) + offset) % 1;
  return {
    scale: 1 + (PUNISH_TIMELINE.ringMaxScale - 1) * phase,
    alpha: PUNISH_TIMELINE.ringPeakAlpha * (1 - phase),
  };
}

export interface FloatTextState {
  readonly offsetY: number;
  readonly alpha: number;
}

export function punishFloatState(elapsedMs: number): FloatTextState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < PUNISH_TIMELINE.floatDelayMs) {
    return { offsetY: 0, alpha: 0 };
  }
  const progress = clamp01(
    (elapsedMs - PUNISH_TIMELINE.floatDelayMs) / PUNISH_TIMELINE.floatDurationMs,
  );
  const fadeSpan = PUNISH_TIMELINE.totalMs - PUNISH_TIMELINE.floatFadeStartMs;
  const alpha =
    elapsedMs <= PUNISH_TIMELINE.floatFadeStartMs
      ? 1
      : clamp01(1 - (elapsedMs - PUNISH_TIMELINE.floatFadeStartMs) / fadeSpan);
  // Whole pixels only, and never a signed zero the stage would have to carry.
  const rise = Math.round(PUNISH_TIMELINE.floatRiseY * progress);
  return { offsetY: rise === 0 ? 0 : -rise, alpha };
}

export interface PulseRingsOptions {
  readonly radius?: number;
  readonly colour?: number;
  readonly count?: number;
  readonly durationMs?: number;
  readonly cycleMs?: number;
  readonly lineWidth?: number;
}

export interface PulseRingsController {
  readonly view: Container;
  setCentre(x: number, y: number): void;
  /** Redraws every ring for the elapsed time; returns false once finished. */
  update(elapsedMs: number): boolean;
}

/**
 * Shared by the coercion spike and the suspect's lose transition, so both
 * impacts read as the same language.
 */
export function createPulseRings(options: PulseRingsOptions = {}): PulseRingsController {
  const radius = options.radius ?? 10;
  const colour = options.colour ?? UI_PALETTE.red;
  const count = Math.max(1, options.count ?? PUNISH_TIMELINE.ringCount);
  const durationMs = options.durationMs ?? PUNISH_TIMELINE.ringDurationMs;
  const cycleMs = options.cycleMs ?? PUNISH_TIMELINE.ringCycleMs;
  const lineWidth = options.lineWidth ?? 1;

  const view = new Container();
  view.eventMode = 'none';
  const rings = Array.from({ length: count }, () => {
    const ring = new Graphics();
    ring.blendMode = 'add';
    // Geometry is drawn once; the loop only touches scale and alpha.
    ring.circle(0, 0, radius).stroke({ color: colour, width: lineWidth });
    view.addChild(ring);
    return ring;
  });

  return {
    view,
    setCentre(x, y): void {
      view.position.set(x, y);
    },
    update(elapsedMs): boolean {
      let running = false;
      rings.forEach((ring, index) => {
        const state = punishRingState(elapsedMs, index, durationMs, cycleMs, count);
        ring.scale.set(state.scale);
        ring.alpha = state.alpha;
        if (state.alpha > 0) running = true;
      });
      view.visible = running;
      return running;
    },
  };
}

export interface PunishJuiceStage {
  readonly width: number;
  readonly height: number;
}

export interface PunishJuiceOptions {
  /** Shaken on impact. Never the overlay itself, or the wash would jitter. */
  readonly shakeTarget?: Container;
  /** Tinted while the rings pulse; restored when the timeline ends. */
  readonly pulseTarget?: Container;
  readonly resourceLabel?: string;
}

export interface PunishJuiceController {
  readonly view: Container;
  readonly active: boolean;
  readonly elapsedMs: number;
  play(coercionDelta: number, anchor: Readonly<{ x: number; y: number }>): void;
  update(deltaMS: number): void;
  destroy(): void;
}

const PULSE_TINT = 0xff_6a_5a;

export function createPunishJuice(
  stage: PunishJuiceStage,
  options: PunishJuiceOptions = {},
): PunishJuiceController {
  const view = new Container();
  view.eventMode = 'none';
  view.visible = false;

  const dim = new Graphics()
    .rect(0, 0, stage.width, stage.height)
    .fill(PUNISH_DIM_COLOUR);
  dim.alpha = 0;
  const rings = createPulseRings({ radius: 10, colour: UI_PALETTE.red });
  view.addChild(dim, rings.view);

  let active = false;
  let elapsedMs = 0;
  let floatText: Container | undefined;
  let floatOriginY = 0;
  const shake = createSceneShake(options.shakeTarget, PUNISH_SHAKE_PROFILE);

  const releaseFloat = (): void => {
    if (floatText === undefined) return;
    view.removeChild(floatText);
    floatText.destroy({ children: true });
    floatText = undefined;
  };

  const finish = (): void => {
    active = false;
    elapsedMs = 0;
    dim.alpha = 0;
    rings.update(PUNISH_TIMELINE.ringDurationMs);
    shake.release();
    releaseFloat();
    if (options.pulseTarget !== undefined) options.pulseTarget.tint = 0xff_ff_ff;
    view.visible = false;
  };

  return {
    view,
    get active(): boolean {
      return active;
    },
    get elapsedMs(): number {
      return elapsedMs;
    },
    play(coercionDelta, anchor): void {
      // Only a rise is a punishment; recovery cards must stay silent.
      if (!Number.isFinite(coercionDelta) || coercionDelta <= 0) return;
      if (active) finish();
      active = true;
      elapsedMs = 0;
      view.visible = true;
      rings.setCentre(anchor.x, anchor.y);
      rings.update(0);
      shake.play();

      const label = createPixelText(
        `+${Math.round(coercionDelta)} ${options.resourceLabel ?? '강압'}`,
        { fontSize: 12, fill: UI_PALETTE.red },
      );
      floatOriginY = anchor.y + PUNISH_TIMELINE.floatStartOffsetY;
      label.position.set(anchor.x, floatOriginY);
      label.alpha = 0;
      floatText = label;
      view.addChild(label);
    },
    update(deltaMS): void {
      if (!active) return;
      elapsedMs += Number.isFinite(deltaMS) ? Math.max(0, deltaMS) : 0;

      dim.alpha = punishDimAlpha(elapsedMs);
      const ringsRunning = rings.update(elapsedMs);
      if (options.pulseTarget !== undefined) {
        options.pulseTarget.tint = ringsRunning ? PULSE_TINT : 0xff_ff_ff;
      }

      shake.update(deltaMS);

      if (floatText !== undefined) {
        const state = punishFloatState(elapsedMs);
        floatText.position.y = floatOriginY + state.offsetY;
        floatText.alpha = state.alpha;
      }

      if (elapsedMs >= PUNISH_TIMELINE.totalMs) finish();
    },
    destroy(): void {
      if (active) finish();
      view.destroy({ children: true });
    },
  };
}
