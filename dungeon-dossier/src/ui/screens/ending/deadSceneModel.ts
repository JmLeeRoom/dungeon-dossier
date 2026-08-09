/**
 * Presentation contract for the defeat screen. Every string arrives already
 * localized: the UI layer never sees an engine type or a localization key.
 */
export type DeadSceneTreatment = 'FADE_OUT' | 'SLOW_FADE' | 'FLASH';

export interface DeadSceneStat {
  readonly label: string;
  readonly value: string;
}

export interface DeadSceneAction {
  readonly actionId: string;
  readonly label: string;
  readonly enabled: boolean;
  /** Rendered under a disabled action so a dead end is never unexplained. */
  readonly disabledReason?: string;
}

export interface DeadSceneScreenModel {
  readonly title: string;
  readonly cause: string;
  /** Full-stage failure location, separate from the reason illustration. */
  readonly backgroundAssetKey: string;
  readonly illustrationAssetKey: string;
  readonly treatment: DeadSceneTreatment;
  /**
   * One-shot stinger for this failure. The reason table has always named one;
   * carrying it here is what lets the mount actually play it, the same way a
   * cutscene beat carries its own cue.
   */
  readonly audioCue: string;
  readonly stats: readonly DeadSceneStat[];
  readonly actions: readonly DeadSceneAction[];
}

export interface DeadSceneTiming {
  readonly fadeMs: number;
  readonly flashMs: number;
}

export const DEAD_SCENE_TIMING: DeadSceneTiming = {
  fadeMs: 240,
  flashMs: 180,
};

/** How long the entry treatment runs before the screen is fully readable. */
export function deadSceneTreatmentDurationMs(treatment: DeadSceneTreatment): number {
  switch (treatment) {
    case 'FADE_OUT': return DEAD_SCENE_TIMING.fadeMs;
    case 'SLOW_FADE': return 900;
    case 'FLASH': return DEAD_SCENE_TIMING.flashMs;
  }
}
