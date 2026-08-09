import { assertEncounterInvariant } from './EncounterInvariantError';
import type { ObjectiveEvaluationSummary } from './ObjectiveEvaluator';
import type { EncounterResourceState } from './ResourceSystem';

export type EncounterOutcome =
  | 'FAILED'
  | 'COERCED_CONFESSION'
  | 'BEST_RESOLUTION'
  | 'PARTIAL_RESOLUTION';

export type OutcomeReason =
  | 'STRESS_DEPLETED'
  | 'COERCION_LIMIT_EXCEEDED'
  | 'TURN_LIMIT_EXCEEDED'
  | 'NO_SOLVABLE_PATH'
  | 'COMPOSURE_DEPLETED'
  | 'BEST_AVAILABLE'
  | 'BEST_CONFIRMED'
  | 'TURN_LIMIT_REACHED'
  | 'NONE';

export interface BestResolutionConditions {
  readonly composureMin: number;
  readonly composureMax: number;
  readonly coercionMax?: number;
}

export interface OutcomeEvaluationInput {
  readonly resources: EncounterResourceState;
  readonly objectives: ObjectiveEvaluationSummary;
  readonly coercionLimit: number;
  readonly turnLimit: number;
  readonly hasSolvablePath: boolean;
  readonly bestConditions: BestResolutionConditions;
  /** True only for the player's explicit [Secure Statement] action. */
  readonly secureStatementRequested: boolean;
}

/**
 * BEST eligibility and UI availability are deliberately separate from the
 * terminal outcome. Meeting the sweet spot never ends an encounter by itself.
 */
export interface BestResolutionAvailability {
  readonly conditionsMet: boolean;
  readonly secureStatementEnabled: boolean;
}

export interface OutcomeEvaluation {
  readonly terminalOutcome: EncounterOutcome | null;
  readonly terminal: boolean;
  readonly bestResolution: BestResolutionAvailability;
  readonly reason: OutcomeReason;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
}

function assertInput(input: OutcomeEvaluationInput): void {
  assertFinite('coercionLimit', input.coercionLimit);
  if (input.coercionLimit <= 0 || input.coercionLimit > 100) {
    throw new Error('coercionLimit must be greater than 0 and at most 100.');
  }
  if (!Number.isInteger(input.turnLimit) || input.turnLimit <= 0) {
    throw new Error('turnLimit must be a positive integer.');
  }
  assertFinite('bestConditions.composureMin', input.bestConditions.composureMin);
  assertFinite('bestConditions.composureMax', input.bestConditions.composureMax);
  if (input.bestConditions.composureMin > input.bestConditions.composureMax) {
    throw new Error('BEST composure minimum cannot exceed its maximum.');
  }
  if (input.bestConditions.coercionMax !== undefined) {
    assertFinite(
      'bestConditions.coercionMax',
      input.bestConditions.coercionMax,
    );
  }
}

export function areBestResolutionConditionsMet(
  input: Pick<OutcomeEvaluationInput, 'resources' | 'objectives' | 'bestConditions'>,
): boolean {
  const { resources, objectives, bestConditions } = input;
  return (
    objectives.allRequiredCompleted &&
    resources.composure >= bestConditions.composureMin &&
    resources.composure <= bestConditions.composureMax &&
    (bestConditions.coercionMax === undefined ||
      resources.coercion <= bestConditions.coercionMax)
  );
}

function terminal(
  terminalOutcome: EncounterOutcome,
  reason: OutcomeReason,
  conditionsMet = false,
): OutcomeEvaluation {
  return {
    terminalOutcome,
    terminal: true,
    bestResolution: {
      conditionsMet,
      secureStatementEnabled: false,
    },
    reason,
  };
}

/**
 * Legacy pre-v2 evaluation kept alive only for the current submit/endTurn
 * loop. The v2 atomic Submit (P0-3B) settles turns through
 * `evaluateSettlementDirective` below and then deletes both this function and
 * its `secureStatementRequested` boolean.
 *
 * Exact order: FAILED -> COERCED -> BEST eligibility/confirmation -> PARTIAL.
 * The coercion limit is the point of failure, not the last safe value.
 * Coercion is clamped to 100, so an exclusive test made the ordinary limit of
 * 100 unreachable: the run could sit at maximum coercion indefinitely.
 */
export function evaluateOutcome(
  input: OutcomeEvaluationInput,
): OutcomeEvaluation {
  assertInput(input);
  const { resources } = input;

  if (resources.stress <= 0) {
    return terminal('FAILED', 'STRESS_DEPLETED');
  }
  if (resources.coercion >= input.coercionLimit) {
    return terminal('FAILED', 'COERCION_LIMIT_EXCEEDED');
  }
  if (resources.turn > input.turnLimit) {
    return terminal('FAILED', 'TURN_LIMIT_EXCEEDED');
  }
  if (!input.hasSolvablePath) {
    return terminal('FAILED', 'NO_SOLVABLE_PATH');
  }

  if (resources.composure <= 0) {
    return terminal('COERCED_CONFESSION', 'COMPOSURE_DEPLETED');
  }

  const conditionsMet = areBestResolutionConditionsMet(input);
  if (conditionsMet && input.secureStatementRequested) {
    return terminal('BEST_RESOLUTION', 'BEST_CONFIRMED', true);
  }

  if (resources.turn === input.turnLimit) {
    return terminal('PARTIAL_RESOLUTION', 'TURN_LIMIT_REACHED', conditionsMet);
  }

  return {
    terminalOutcome: null,
    terminal: false,
    bestResolution: {
      conditionsMet,
      secureStatementEnabled: conditionsMet,
    },
    reason: conditionsMet ? 'BEST_AVAILABLE' : 'NONE',
  };
}

/**
 * Monotonic per-phase threshold facts (v2 §3.3.2). Each resource-mutating
 * phase of a Submit transaction ORs the thresholds it produced into this
 * bitset; later recovery in the same transaction never clears a bit that is
 * already true.
 */
export interface TerminalThresholdFacts {
  readonly hpDepleted: boolean;
  readonly coercionLimitReached: boolean;
  readonly composureDepleted: boolean;
}

export const EMPTY_TERMINAL_THRESHOLD_FACTS: TerminalThresholdFacts =
  Object.freeze({
    hpDepleted: false,
    coercionLimitReached: false,
    composureDepleted: false,
  });

/** ORs the thresholds visible in `resources` into `facts`. Never clears a bit. */
export function observeTerminalThresholds(
  facts: TerminalThresholdFacts,
  resources: Pick<EncounterResourceState, 'stress' | 'coercion' | 'composure'>,
  coercionLimit: number,
): TerminalThresholdFacts {
  return {
    hpDepleted: facts.hpDepleted || resources.stress <= 0,
    coercionLimitReached:
      facts.coercionLimitReached || resources.coercion >= coercionLimit,
    composureDepleted: facts.composureDepleted || resources.composure <= 0,
  };
}

export interface ReducedTerminalThreshold {
  readonly outcome: EncounterOutcome;
  readonly reason: OutcomeReason;
}

/**
 * Fixed fact priority: HP failure beats the coercion limit, which beats the
 * composure-zero coerced confession. Returns null when no fact is set.
 */
export function reduceTerminalThresholdFacts(
  facts: TerminalThresholdFacts,
): ReducedTerminalThreshold | null {
  if (facts.hpDepleted) {
    return { outcome: 'FAILED', reason: 'STRESS_DEPLETED' };
  }
  if (facts.coercionLimitReached) {
    return { outcome: 'FAILED', reason: 'COERCION_LIMIT_EXCEEDED' };
  }
  if (facts.composureDepleted) {
    return { outcome: 'COERCED_CONFESSION', reason: 'COMPOSURE_DEPLETED' };
  }
  return null;
}

export type SecureDeclineDisposition =
  | 'START_NEXT_TURN'
  | 'PARTIAL_RESOLUTION';

/**
 * What the settled turn must do next. Terminal results are mandatory, the
 * secure decision is a stable checkpoint that waits for player input, and
 * START_NEXT_TURN is the only branch that may create a new turn.
 */
export type SettlementDirective =
  | {
      readonly kind: 'TERMINAL';
      readonly outcome: EncounterOutcome;
      readonly reason: OutcomeReason;
    }
  | {
      readonly kind: 'OFFER_SECURE_DECISION';
      readonly onDecline: SecureDeclineDisposition;
    }
  | { readonly kind: 'START_NEXT_TURN' };

export interface SettlementDirectiveInput {
  /** Monotonic facts accumulated across the transaction's resource phases. */
  readonly thresholdFacts: TerminalThresholdFacts;
  /** A resolver-authored forced outcome, preserved separately from facts. */
  readonly authoredForcedOutcome: EncounterOutcome | null;
  readonly hasSolvablePath: boolean;
  readonly resources: EncounterResourceState;
  readonly objectives: ObjectiveEvaluationSummary;
  readonly bestConditions: BestResolutionConditions;
  readonly coercionLimit: number;
  /** Turns fully consumed by valid Submits, already including this one. */
  readonly turnsSpent: number;
  readonly turnLimit: number;
}

function assertDirectiveInput(input: SettlementDirectiveInput): void {
  assertFinite('coercionLimit', input.coercionLimit);
  if (input.coercionLimit <= 0 || input.coercionLimit > 100) {
    throw new Error('coercionLimit must be greater than 0 and at most 100.');
  }
  if (!Number.isInteger(input.turnLimit) || input.turnLimit <= 0) {
    throw new Error('turnLimit must be a positive integer.');
  }
  if (!Number.isInteger(input.turnsSpent) || input.turnsSpent < 0) {
    throw new Error('turnsSpent must be a non-negative integer.');
  }
  assertFinite('bestConditions.composureMin', input.bestConditions.composureMin);
  assertFinite('bestConditions.composureMax', input.bestConditions.composureMax);
  if (input.bestConditions.composureMin > input.bestConditions.composureMax) {
    throw new Error('BEST composure minimum cannot exceed its maximum.');
  }
  if (input.bestConditions.coercionMax !== undefined) {
    assertFinite('bestConditions.coercionMax', input.bestConditions.coercionMax);
  }
  // Overshooting the limit is corrupted state or save data, never a gameplay
  // result; it must not be hidden behind a BEST or PARTIAL outcome.
  assertEncounterInvariant(
    input.turnsSpent <= input.turnLimit,
    `turnsSpent (${input.turnsSpent}) exceeded turnLimit (${input.turnLimit}).`,
  );
}

/** v2 BEST eligibility: objectives, sweet spot, and both coercion guards. */
export function isBestResolutionEligible(
  input: Pick<
    SettlementDirectiveInput,
    'resources' | 'objectives' | 'bestConditions' | 'coercionLimit'
  >,
): boolean {
  return (
    areBestResolutionConditionsMet(input) &&
    input.resources.composure > 0 &&
    input.resources.coercion < input.coercionLimit
  );
}

/**
 * v2 settlement priority (§3.5.1): threshold facts reduced HP -> coercion ->
 * composure, then the authored forced outcome, then path-loss failure, then
 * the sweet-spot decision, then turn exhaustion, then the next turn. The
 * decision deliberately outranks PARTIAL so a sweet spot created by the final
 * allowed turn can still be secured; declining it on that final turn resolves
 * as PARTIAL instead of starting a turn that does not exist.
 */
export function evaluateSettlementDirective(
  input: SettlementDirectiveInput,
): SettlementDirective {
  assertDirectiveInput(input);

  const reduced = reduceTerminalThresholdFacts(input.thresholdFacts);
  if (reduced !== null) {
    return { kind: 'TERMINAL', outcome: reduced.outcome, reason: reduced.reason };
  }

  if (input.authoredForcedOutcome !== null) {
    return {
      kind: 'TERMINAL',
      outcome: input.authoredForcedOutcome,
      reason: 'NONE',
    };
  }

  if (!input.hasSolvablePath) {
    return { kind: 'TERMINAL', outcome: 'FAILED', reason: 'NO_SOLVABLE_PATH' };
  }

  if (isBestResolutionEligible(input)) {
    return {
      kind: 'OFFER_SECURE_DECISION',
      onDecline:
        input.turnsSpent === input.turnLimit
          ? 'PARTIAL_RESOLUTION'
          : 'START_NEXT_TURN',
    };
  }

  if (input.turnsSpent === input.turnLimit) {
    return {
      kind: 'TERMINAL',
      outcome: 'PARTIAL_RESOLUTION',
      reason: 'TURN_LIMIT_REACHED',
    };
  }

  return { kind: 'START_NEXT_TURN' };
}
