import type { Container } from 'pixi.js';

export interface ShakeProfile {
  readonly durationMs: number;
  readonly amplitude: number;
  /** Half-cycles of the sine across the whole duration. */
  readonly oscillations: number;
}

/**
 * Damped horizontal oscillation, rounded to whole pixels. The stage is
 * integer-scaled, so a fractional offset would knock every pixel-art layer off
 * the display grid for the length of the shake.
 */
export function dampedShakeOffset(elapsedMs: number, profile: ShakeProfile): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (profile.durationMs <= 0 || elapsedMs >= profile.durationMs) return 0;
  const progress = elapsedMs / profile.durationMs;
  const offset = Math.round(
    profile.amplitude *
      Math.sin(progress * Math.PI * profile.oscillations) *
      (1 - progress),
  );
  // Math.round(-0.2) is -0; the stage should only ever see a plain zero.
  return offset === 0 ? 0 : offset;
}

export interface SceneShakeController {
  readonly active: boolean;
  readonly elapsedMs: number;
  /** Restarts from zero, re-capturing the target's resting x. */
  play(): void;
  update(deltaMS: number): void;
  /** Snaps the target back to its resting x and stops. */
  release(): void;
}

/**
 * Moves a container's x only. Callers keep ownership of the container, so the
 * resting position is captured on play and restored on release rather than
 * being assumed to be zero.
 */
export function createSceneShake(
  target: Container | undefined,
  profile: ShakeProfile,
): SceneShakeController {
  let active = false;
  let elapsedMs = 0;
  let baseX: number | undefined;

  const restore = (): void => {
    if (target !== undefined && baseX !== undefined) target.position.x = baseX;
    baseX = undefined;
  };

  return {
    get active(): boolean {
      return active;
    },
    get elapsedMs(): number {
      return elapsedMs;
    },
    play(): void {
      restore();
      active = true;
      elapsedMs = 0;
      baseX = target?.position.x;
    },
    update(deltaMS): void {
      if (!active) return;
      elapsedMs += Number.isFinite(deltaMS) ? Math.max(0, deltaMS) : 0;
      if (target !== undefined && baseX !== undefined) {
        target.position.x = baseX + dampedShakeOffset(elapsedMs, profile);
      }
      if (elapsedMs >= profile.durationMs) {
        active = false;
        restore();
      }
    },
    release(): void {
      active = false;
      elapsedMs = 0;
      restore();
    },
  };
}
