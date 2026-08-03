import type { DeckState } from '../cards';
import type { ContentId } from '../domain';

export const GLOBAL_COERCION_MAX = 100;

/** Canonical Phase-4 values; content data may reference these by archetype. */
export const ENCOUNTER_COMPOSURE_MAX = {
  SLIME: 60,
  HARPY: 70,
  MINOTAUR: 120,
  GOBLIN: 90,
  ORC: 100,
  SUCCUBUS: 140,
  DWARF: 110,
  CYCLOPS: 120,
  FALLEN_HERO: 180,
} as const;

export type EncounterArchetype = keyof typeof ENCOUNTER_COMPOSURE_MAX;

export function getEncounterComposureMax(
  archetype: EncounterArchetype,
): number {
  return ENCOUNTER_COMPOSURE_MAX[archetype];
}

export interface EncounterResourceState {
  readonly composure: number;
  readonly commandPoints: number;
  readonly coercion: number;
  readonly stress: number;
  readonly dp: number;
  readonly trust: number;
  readonly turn: number;
}

export interface EncounterResourceLimits {
  readonly composureMax: number;
  readonly commandPointMax: number;
  readonly commandPointsPerTurn: number;
  readonly coercionLimit: number;
  readonly stressMax: number;
  readonly trustMax: number;
}

export interface CommandPointRestoreContext {
  readonly encounterArchetype?: EncounterArchetype;
  readonly witnessProtectionRestored?: boolean;
}

export interface TurnStartDrawRules {
  readonly perTurn: number;
  readonly handLimit: number;
  readonly reshuffleOnEmpty: boolean;
}

export type TurnDurationMap = Readonly<Record<string, number>>;

export interface EncounterTurnStartState {
  readonly resources: EncounterResourceState;
  readonly deck: DeckState;
  readonly statusDurations: TurnDurationMap;
  readonly cooldowns: TurnDurationMap;
}

export interface EncounterTurnStartOptions
  extends CommandPointRestoreContext {
  readonly draw: TurnStartDrawRules;
  /** Inject a seeded reorder function when discard recycling must be shuffled. */
  readonly reorderDiscardPile?: (
    cards: readonly ContentId[],
  ) => readonly ContentId[];
}

export interface DurationTickResult {
  readonly durations: TurnDurationMap;
  readonly completedIds: readonly string[];
}

export interface EncounterTurnStartResult {
  readonly state: EncounterTurnStartState;
  readonly drawnCardIds: readonly ContentId[];
  readonly expiredStatusIds: readonly string[];
  readonly readyCooldownIds: readonly string[];
}

export type EncounterResourceDelta = Readonly<
  Partial<EncounterResourceState>
>;

export class InsufficientCommandPointsError extends Error {
  public constructor(
    public readonly available: number,
    public readonly required: number,
  ) {
    super(`Insufficient command points: ${available} available, ${required} required.`);
    this.name = 'InsufficientCommandPointsError';
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
}

function assertNonNegative(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0) throw new Error(`${name} must be non-negative.`);
}

function assertPositive(name: string, value: number): void {
  assertFinite(name, value);
  if (value <= 0) throw new Error(`${name} must be positive.`);
}

function assertNonNegativeInteger(name: string, value: number): void {
  assertNonNegative(name, value);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function assertResourceLimits(limits: EncounterResourceLimits): void {
  assertPositive('composureMax', limits.composureMax);
  assertPositive('commandPointMax', limits.commandPointMax);
  assertNonNegative('commandPointsPerTurn', limits.commandPointsPerTurn);
  assertPositive('coercionLimit', limits.coercionLimit);
  if (limits.coercionLimit > GLOBAL_COERCION_MAX) {
    throw new Error(`coercionLimit cannot exceed ${GLOBAL_COERCION_MAX}.`);
  }
  assertPositive('stressMax', limits.stressMax);
  assertNonNegative('trustMax', limits.trustMax);
}

/**
 * Hard resource invariants. The encounter coercion limit is deliberately not
 * a clamp: coercion may cross that limit so OutcomeEvaluator can fail the run.
 */
export function assertResourceInvariants(
  state: EncounterResourceState,
  limits: EncounterResourceLimits,
): void {
  assertResourceLimits(limits);
  assertNonNegative('composure', state.composure);
  if (state.composure > limits.composureMax) {
    throw new Error('composure cannot exceed composureMax.');
  }
  assertNonNegative('commandPoints', state.commandPoints);
  if (state.commandPoints > limits.commandPointMax) {
    throw new Error('commandPoints cannot exceed commandPointMax.');
  }
  assertNonNegative('coercion', state.coercion);
  if (state.coercion > GLOBAL_COERCION_MAX) {
    throw new Error(`coercion cannot exceed ${GLOBAL_COERCION_MAX}.`);
  }
  assertNonNegative('stress', state.stress);
  if (state.stress > limits.stressMax) {
    throw new Error('stress cannot exceed stressMax.');
  }
  assertNonNegative('dp', state.dp);
  assertNonNegative('trust', state.trust);
  if (state.trust > limits.trustMax) {
    throw new Error('trust cannot exceed trustMax.');
  }
  assertNonNegativeInteger('turn', state.turn);
}

/** Creates a valid resource state and clamps optional seed values to caps. */
export function createResourceState(
  limits: EncounterResourceLimits,
  initial: EncounterResourceDelta = {},
): EncounterResourceState {
  assertResourceLimits(limits);
  const candidate: EncounterResourceState = {
    composure: initial.composure ?? limits.composureMax,
    commandPoints: initial.commandPoints ?? 0,
    coercion: initial.coercion ?? 0,
    stress: initial.stress ?? limits.stressMax,
    dp: initial.dp ?? 0,
    trust: initial.trust ?? 0,
    turn: initial.turn ?? 0,
  };
  return clampResourceState(candidate, limits);
}

export function clampResourceState(
  state: EncounterResourceState,
  limits: EncounterResourceLimits,
): EncounterResourceState {
  assertResourceLimits(limits);
  assertFinite('composure', state.composure);
  assertFinite('commandPoints', state.commandPoints);
  assertFinite('coercion', state.coercion);
  assertFinite('stress', state.stress);
  assertFinite('dp', state.dp);
  assertFinite('trust', state.trust);
  assertNonNegativeInteger('turn', state.turn);

  return {
    composure: clamp(state.composure, 0, limits.composureMax),
    commandPoints: clamp(state.commandPoints, 0, limits.commandPointMax),
    coercion: clamp(state.coercion, 0, GLOBAL_COERCION_MAX),
    stress: clamp(state.stress, 0, limits.stressMax),
    dp: Math.max(0, state.dp),
    trust: clamp(state.trust, 0, limits.trustMax),
    turn: state.turn,
  };
}

/** Pure, saturating resource update. Non-finite deltas are rejected. */
export function applyResourceDelta(
  state: EncounterResourceState,
  delta: EncounterResourceDelta,
  limits: EncounterResourceLimits,
): EncounterResourceState {
  assertResourceInvariants(state, limits);
  for (const [resource, amount] of Object.entries(delta)) {
    if (amount === undefined) continue;
    assertFinite(`${resource} delta`, amount);
    if (resource === 'turn' && !Number.isInteger(amount)) {
      throw new Error('turn delta must be an integer.');
    }
  }

  return clampResourceState(
    {
      composure: state.composure + (delta.composure ?? 0),
      commandPoints: state.commandPoints + (delta.commandPoints ?? 0),
      coercion: state.coercion + (delta.coercion ?? 0),
      stress: state.stress + (delta.stress ?? 0),
      dp: state.dp + (delta.dp ?? 0),
      trust: state.trust + (delta.trust ?? 0),
      turn: state.turn + (delta.turn ?? 0),
    },
    limits,
  );
}

/** TURN_START: increment the turn and restore, rather than add, CP. */
export function beginEncounterTurn(
  state: EncounterResourceState,
  limits: EncounterResourceLimits,
  context: CommandPointRestoreContext = {},
): EncounterResourceState {
  assertResourceInvariants(state, limits);
  return {
    ...state,
    commandPoints: resolveCommandPointRestore(limits, context),
    turn: state.turn + 1,
  };
}

/** Cyclops restores only 2 CP until witness protection lifts the cap. */
export function resolveCommandPointRestore(
  limits: EncounterResourceLimits,
  context: CommandPointRestoreContext = {},
): number {
  assertResourceLimits(limits);
  const encounterCap =
    context.encounterArchetype === 'CYCLOPS' &&
    context.witnessProtectionRestored !== true
      ? 2
      : limits.commandPointMax;
  return Math.min(
    limits.commandPointsPerTurn,
    limits.commandPointMax,
    encounterCap,
  );
}

function assertDrawRules(rules: TurnStartDrawRules): void {
  assertNonNegativeInteger('draw.perTurn', rules.perTurn);
  assertPositive('draw.handLimit', rules.handLimit);
  if (!Number.isInteger(rules.handLimit)) {
    throw new Error('draw.handLimit must be an integer.');
  }
}

function sameMultiset(
  left: readonly ContentId[],
  right: readonly ContentId[],
): boolean {
  if (left.length !== right.length) return false;
  const remaining = [...right];
  for (const value of left) {
    const index = remaining.indexOf(value);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

export function drawCardsAtTurnStart(
  deck: DeckState,
  rules: TurnStartDrawRules,
  reorderDiscardPile?: (
    cards: readonly ContentId[],
  ) => readonly ContentId[],
): Readonly<{ deck: DeckState; drawnCardIds: readonly ContentId[] }> {
  assertDrawRules(rules);
  const drawPile = [...deck.drawPile];
  const hand = [...deck.hand];
  let discardPile = [...deck.discardPile];
  const drawnCardIds: ContentId[] = [];
  const drawCount = Math.min(rules.perTurn, Math.max(0, rules.handLimit - hand.length));

  while (drawnCardIds.length < drawCount) {
    if (drawPile.length === 0) {
      if (!rules.reshuffleOnEmpty || discardPile.length === 0) break;
      const originalDiscard = [...discardPile];
      const reordered = reorderDiscardPile?.(originalDiscard) ?? originalDiscard;
      if (!sameMultiset(originalDiscard, reordered)) {
        throw new Error('reorderDiscardPile must preserve every discarded card.');
      }
      drawPile.push(...reordered);
      discardPile = [];
    }

    const cardId = drawPile.shift();
    if (cardId === undefined) break;
    drawnCardIds.push(cardId);
    hand.push(cardId);
  }

  return {
    deck: { drawPile, hand, discardPile },
    drawnCardIds,
  };
}

/** Decrements active statuses/cooldowns and removes entries that reach zero. */
export function tickTurnDurations(
  durations: TurnDurationMap,
): DurationTickResult {
  const next: Record<string, number> = {};
  const completedIds: string[] = [];

  for (const [id, duration] of Object.entries(durations)) {
    assertNonNegativeInteger(`${id} duration`, duration);
    if (duration <= 1) completedIds.push(id);
    else next[id] = duration - 1;
  }

  return { durations: next, completedIds };
}

/**
 * Atomic pure TURN_START operation: advance/restore resources, draw, then tick
 * statuses and partner cooldowns. The input objects are never mutated.
 */
export function processEncounterTurnStart(
  state: EncounterTurnStartState,
  limits: EncounterResourceLimits,
  options: EncounterTurnStartOptions,
): EncounterTurnStartResult {
  const resources = beginEncounterTurn(state.resources, limits, options);
  const drawn = drawCardsAtTurnStart(
    state.deck,
    options.draw,
    options.reorderDiscardPile,
  );
  const statuses = tickTurnDurations(state.statusDurations);
  const cooldowns = tickTurnDurations(state.cooldowns);

  return {
    state: {
      resources,
      deck: drawn.deck,
      statusDurations: statuses.durations,
      cooldowns: cooldowns.durations,
    },
    drawnCardIds: drawn.drawnCardIds,
    expiredStatusIds: statuses.completedIds,
    readyCooldownIds: cooldowns.completedIds,
  };
}

export function spendCommandPoints(
  state: EncounterResourceState,
  cost: number,
  limits: EncounterResourceLimits,
): EncounterResourceState {
  assertResourceInvariants(state, limits);
  assertNonNegative('command point cost', cost);
  if (cost > state.commandPoints) {
    throw new InsufficientCommandPointsError(state.commandPoints, cost);
  }
  return { ...state, commandPoints: state.commandPoints - cost };
}
