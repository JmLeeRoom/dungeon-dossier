import type { CaseDefinition } from '../content-io';
import type { EncounterOutcome } from '../engine/encounter';
import type { CaseGrade } from '../engine/run';
import type { InterrogationScreenModel } from '../ui/screens/interrogation';

export const MAX_AUTOPLAY_SEED = 0xffff_ffff;

/** Shared L1/L2 seed contract: an unsigned 32-bit integer written in decimal. */
export function isAutoplaySeed(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_AUTOPLAY_SEED;
}

/**
 * Parses the optional DEV query seed without JavaScript's lossy numeric
 * coercions (`-1 >>> 0`, fractions, exponent notation, or an empty string).
 */
export function parseAutoplaySeedParameter(
  parameter: string | null,
): number | undefined {
  if (parameter === null) return undefined;
  const normalized = parameter.trim();
  if (!/^(?:0|[1-9][0-9]*)$/u.test(normalized)) return undefined;
  const value = Number(normalized);
  return isAutoplaySeed(value) ? value : undefined;
}

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

const AUTOPLAY_VISIBLE_STRING_FIELDS = new Set([
  'body',
  'description',
  'displayName',
  'heading',
  'label',
  'message',
  'name',
  'partnerName',
  'script',
  'suspectName',
  'text',
  'title',
]);

/**
 * Collects player-visible text fields from a plain UI view model. Structural
 * IDs remain available to callbacks but are deliberately excluded, so a raw
 * ID is reported only when it leaks into a title/label/description/etc.
 * Cycles are tolerated for defensive callers.
 */
export function collectAutoplaySceneStrings(value: unknown): readonly string[] {
  const strings: string[] = [];
  const visited = new WeakSet<object>();
  const visit = (current: unknown, visible: boolean): void => {
    if (typeof current === 'string') {
      if (visible) strings.push(current);
      return;
    }
    if (current === null || typeof current !== 'object') return;
    if (visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) {
      for (const entry of current) visit(entry, visible);
      return;
    }
    for (const [key, entry] of Object.entries(current)) {
      visit(entry, AUTOPLAY_VISIBLE_STRING_FIELDS.has(key));
    }
  };
  visit(value, false);
  return strings;
}

interface AutoplayScenePresentation {
  /** Player-visible strings captured from the exact model rendered on screen. */
  readonly displayStrings?: readonly string[];
}

export type AutoplayScene = AutoplayScenePresentation & (
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
      readonly pattern: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
      readonly choiceIds: readonly string[];
      readonly answerMapping: Readonly<Record<string, string>>;
      readonly spotIds: readonly string[];
      readonly discoveredSpotIds: readonly string[];
      readonly attemptLimit: number;
      /** Pattern D: tuning options and the cards each one may target. */
      readonly tuningOptionIds: readonly string[];
      readonly tuningCardIdsByOption: Readonly<Record<string, readonly string[]>>;
      /** Pattern E */
      readonly topicIds: readonly string[];
      readonly canvassedTopicIds: readonly string[];
      /** Pattern F */
      readonly collectTargetIds: readonly string[];
      readonly collectedTargetIds: readonly string[];
      choose(choiceId: string): void;
      submitPlacement(mapping: Readonly<Record<string, string>>): void;
      investigate(spotId: string): void;
      applyTuning(optionId: string, cardId: string): void;
      canvass(topicId: string): void;
      collect(targetId: string): void;
      /** Ends a limited-probe node early; patterns D/E/F only. */
      finish(): void;
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
    }
  | {
      readonly kind: 'DEAD_SCENE';
      readonly reason: string;
      /** Only the actions the player may actually take right now. */
      readonly actionIds: readonly string[];
      act(actionId: string): void;
    }
);

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
  readonly mode: 'watch' | 'turbo' | 'record' | 'video' | 'submission';
  readonly policy: 'best' | 'partial' | 'coerced' | 'greedy' | 'fuzz';
  readonly seed: number;
}
