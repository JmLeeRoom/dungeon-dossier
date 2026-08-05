export const SUSPECT_STATE_PARTS = ['base', 'upset', 'lose'] as const;
export type SuspectStatePart = (typeof SUSPECT_STATE_PARTS)[number];

/** Composure ratio at or below which the suspect swaps to the agitated parts sheet. */
export const DEFAULT_UPSET_COMPOSURE_RATIO = 0.4;

export interface SuspectStateInput {
  readonly composure: number;
  readonly composureMax: number;
  /** Set once the interrogation win condition (confession) has been reached. */
  readonly confessed?: boolean;
  readonly upsetRatio?: number;
}

export interface SuspectStateSnapshot {
  readonly part: SuspectStatePart;
  readonly composureRatio: number;
  readonly defeated: boolean;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function suspectComposureRatio(composure: number, composureMax: number): number {
  const max = finite(composureMax, 0);
  if (max <= 0) return 0;
  return clamp01(finite(composure, 0) / max);
}

export function upsetThreshold(input: SuspectStateInput): number {
  return clamp01(finite(input.upsetRatio ?? DEFAULT_UPSET_COMPOSURE_RATIO, DEFAULT_UPSET_COMPOSURE_RATIO));
}

/**
 * The only rule that decides which 512x512 state sheet is drawn. Defeat wins
 * over agitation so a confession never renders as merely upset.
 */
export function evaluateSuspectState(input: SuspectStateInput): SuspectStateSnapshot {
  const composureRatio = suspectComposureRatio(input.composure, input.composureMax);
  const defeated = input.confessed === true || finite(input.composure, 0) <= 0;
  if (defeated) {
    return { part: 'lose', composureRatio, defeated: true };
  }
  return {
    part: composureRatio <= upsetThreshold(input) ? 'upset' : 'base',
    composureRatio,
    defeated: false,
  };
}

export function deriveSuspectStatePart(input: SuspectStateInput): SuspectStatePart {
  return evaluateSuspectState(input).part;
}

export function isSuspectStatePart(value: string): value is SuspectStatePart {
  return (SUSPECT_STATE_PARTS as readonly string[]).includes(value);
}
