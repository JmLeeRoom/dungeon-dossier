import type { CaseDefinition } from '../content-io';
import type { EncounterOutcome } from '../engine/encounter';
import type { CaseGrade } from '../engine/run';
import type { InterrogationScreenModel } from '../ui/screens/interrogation';

/** Present query values launch L2; only explicit false/0 values opt out. */
export function isAutoplayRequested(
  parameter: string | null,
  development: boolean,
): boolean {
  if (!development || parameter === null) return false;
  const normalized = parameter.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0';
}

/** Wall-clock fallback for direction playback when the Pixi ticker is throttled. */
export function scaledDirectionDelayMs(
  durationMs: number,
  elapsedMs: number,
  timeScale: number,
): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError('Direction duration must be a positive finite number.');
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Direction elapsed time must be a finite non-negative number.');
  }
  if (!Number.isFinite(timeScale) || timeScale <= 0) {
    throw new RangeError('Direction time scale must be a positive finite number.');
  }
  return Math.ceil(Math.max(0, durationMs - elapsedMs) / timeScale);
}

export type AutoplayFacet = 'WHO' | 'WHEN' | 'WHERE' | 'WHAT' | 'HOW' | 'WHY';

export interface AutoplaySubmission {
  readonly cardId: string;
  readonly facet: AutoplayFacet;
  readonly evidenceIds: readonly string[];
}

export interface AutoplayCardPlayability {
  readonly playable: boolean;
  readonly effectiveCpCost: number;
}

export type AutoplayScene =
  | {
      readonly kind: 'STRIP';
      readonly nodeIndex: number;
      readonly nodeId: string;
      readonly nodeKind: 'ENCOUNTER' | 'EVENT' | 'BOSS';
      readonly nodeRef: string;
      continue(): void;
    }
  | {
      readonly kind: 'EVENT';
      readonly eventId: string;
      readonly pattern: 'A' | 'B' | 'C';
      readonly choiceIds: readonly string[];
      readonly answerMapping: Readonly<Record<string, string>>;
      readonly spotIds: readonly string[];
      readonly discoveredSpotIds: readonly string[];
      readonly attemptLimit: number;
      choose(choiceId: string): void;
      submitPlacement(mapping: Readonly<Record<string, string>>): void;
      investigate(spotId: string): void;
    }
  | {
      readonly kind: 'EVENT_RESULT';
      readonly eventId: string;
      continue(): void;
    }
  | {
      readonly kind: 'INTERROGATION';
      readonly encounterId: string;
      readonly machineState: string;
      readonly turn: number;
      readonly turnLimit: number;
      readonly secureStatementEnabled: boolean;
      readonly model: InterrogationScreenModel;
      readonly caseDefinition: CaseDefinition;
      readonly cardPlayability: Readonly<Record<string, AutoplayCardPlayability>>;
      readonly requiredObjectives: readonly Readonly<{
        objectiveId: string;
        completed: boolean;
      }>[];
      submit(submission: AutoplaySubmission): void;
      endTurn(): void;
      secureStatement(): void;
      skipTypewriter(): void;
    }
  | {
      readonly kind: 'REWARD';
      readonly grade: string;
      readonly rewardIds: readonly string[];
      select(rewardId: string): void;
    }
  | { readonly kind: 'DIRECTION' }
  | {
      readonly kind: 'ENDING';
      readonly endingId: string;
      restart(): void;
    };

export interface AutoplayRunSnapshot {
  readonly nodeIndex: number;
  readonly flags: Readonly<Record<string, boolean | number | string>>;
  readonly dp: number;
  readonly stress: number;
  readonly trust: number;
  readonly claimedRewardIds: readonly string[];
  readonly pendingRewardIds: readonly string[];
  readonly acquiredRelicIds: readonly string[];
  readonly completedNodeIds: readonly string[];
  readonly gradeHistory: readonly Readonly<{
    nodeId: string;
    outcome: EncounterOutcome;
    grade: CaseGrade;
  }>[];
  readonly outcomeHistory: readonly Readonly<{
    nodeId: string;
    outcome: EncounterOutcome;
  }>[];
  readonly terminal: boolean;
}

/**
 * Callback-driven automation surface exposed by bootstrap in DEV only.
 * Screens render and animate exactly as in production; only input is bypassed.
 */
export interface AutoplayPort {
  scene(): AutoplayScene | undefined;
  runSnapshot(): AutoplayRunSnapshot;
  lastFlowError(): string | undefined;
  /** Direction-overlay playback multiplier: 1 = realtime, 20 = turbo. */
  setDirectionTimeScale(scale: number): void;
  onSceneChange(listener: () => void): () => void;
}

export interface AutoplayOptions {
  readonly mode: 'watch' | 'turbo' | 'record';
  readonly policy: 'best' | 'partial' | 'coerced' | 'greedy' | 'fuzz';
  readonly seed: number;
}
