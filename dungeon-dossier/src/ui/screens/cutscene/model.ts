import { dampedShakeOffset, type ShakeProfile } from '../../core/shake';

/**
 * Presentation-side copy of the authored treatment vocabulary. The UI must not
 * import engine schemas, so the app layer converts the engine enum into this
 * one with an exhaustive switch.
 */
export const PRESENTATION_TREATMENTS = [
  'NONE',
  'FADE_IN',
  'FADE_OUT',
  'SHAKE',
  'FLASH',
  'SLOW_FADE',
] as const;
export type PresentationTreatment = (typeof PRESENTATION_TREATMENTS)[number];

export type CutscenePortraitSide = 'LEFT' | 'RIGHT';

export interface CutscenePortraitView {
  readonly side: CutscenePortraitSide;
  readonly assetKey: string;
  readonly dim: boolean;
}

export interface CutsceneChoiceView {
  readonly choiceId: string;
  readonly label: string;
}

/** Every string here is already resolved through t(); the UI never sees keys. */
export interface CutsceneBeatView {
  readonly beatId: string;
  readonly backgroundAssetKey?: string;
  readonly portraits: readonly CutscenePortraitView[];
  readonly speakerName?: string;
  readonly text: string;
  readonly treatment: PresentationTreatment;
  readonly audioCue?: string;
  readonly durationMs: number;
  readonly choices: readonly CutsceneChoiceView[];
  /** App-validated default branch used by skip on a skippable cutscene. */
  readonly defaultChoiceId?: string;
}

export type CutscenePlaybackState =
  | 'RUNNING'
  | 'WAITING_INPUT'
  | 'COMPLETE'
  | 'CANCELLED';

export type CutsceneBeatPhase = 'TYPING' | 'READY' | 'WAITING_CHOICE';

export interface CutsceneSelection {
  readonly beatId: string;
  readonly choiceId: string;
}

/** Shared with the portrait rattle so both read as the same camera. */
export const CUTSCENE_SHAKE_PROFILE: ShakeProfile = {
  durationMs: 400,
  amplitude: 3,
  oscillations: 5,
};

export interface PresentationTreatmentSpec {
  readonly durationMs: number;
  readonly alphaFrom: number;
  readonly alphaTo: number;
  readonly shake: ShakeProfile | null;
  readonly flashAlpha: number;
}

/**
 * The renderer reads this table instead of branching on treatment ids, mirroring
 * how directionTable.ts keeps judgment/ending direction selection declarative.
 */
export const PRESENTATION_TREATMENT_TABLE: Readonly<
  Record<PresentationTreatment, PresentationTreatmentSpec>
> = {
  NONE: { durationMs: 0, alphaFrom: 1, alphaTo: 1, shake: null, flashAlpha: 0 },
  FADE_IN: { durationMs: 240, alphaFrom: 0, alphaTo: 1, shake: null, flashAlpha: 0 },
  FADE_OUT: { durationMs: 240, alphaFrom: 1, alphaTo: 0, shake: null, flashAlpha: 0 },
  SLOW_FADE: { durationMs: 900, alphaFrom: 0, alphaTo: 1, shake: null, flashAlpha: 0 },
  SHAKE: {
    durationMs: 400,
    alphaFrom: 1,
    alphaTo: 1,
    shake: CUTSCENE_SHAKE_PROFILE,
    flashAlpha: 0,
  },
  FLASH: { durationMs: 180, alphaFrom: 1, alphaTo: 1, shake: null, flashAlpha: 0.85 },
};

export interface PresentationTreatmentFrame {
  readonly alpha: number;
  readonly offsetX: number;
  readonly flashAlpha: number;
}

/** Pure per-frame projection of a treatment so the curve can be tested alone. */
export function presentationTreatmentFrame(
  treatment: PresentationTreatment,
  elapsedMs: number,
): PresentationTreatmentFrame {
  const spec = PRESENTATION_TREATMENT_TABLE[treatment];
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const progress =
    spec.durationMs <= 0 ? 1 : Math.min(1, safeElapsedMs / spec.durationMs);
  return {
    alpha: spec.alphaFrom + (spec.alphaTo - spec.alphaFrom) * progress,
    offsetX: spec.shake === null ? 0 : dampedShakeOffset(safeElapsedMs, spec.shake),
    flashAlpha: spec.flashAlpha * (1 - progress),
  };
}

export const CUTSCENE_LAYOUT = {
  stage: { width: 640, height: 400 },
  portraitLeft: { x: 24, y: 76, width: 184, height: 184 },
  portraitRight: { x: 432, y: 76, width: 184, height: 184 },
  dialoguePanel: { x: 16, y: 274, width: 608, height: 110 },
  speakerPlate: { x: 28, y: 262, width: 180, height: 20 },
  bodyText: { x: 32, y: 292, width: 576, height: 76 },
  choices: { x: 170, y: 148, width: 300, rowHeight: 24, rowGap: 4 },
  skipButton: { x: 588, y: 8, width: 44, height: 20 },
} as const;

export const DIMMED_PORTRAIT_ALPHA = 0.45;
