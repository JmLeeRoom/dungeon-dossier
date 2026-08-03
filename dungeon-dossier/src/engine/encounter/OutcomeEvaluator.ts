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
 * Exact order: FAILED -> COERCED -> BEST eligibility/confirmation -> PARTIAL.
 * The encounter limit is inclusive; only values over it are FAILED.
 */
export function evaluateOutcome(
  input: OutcomeEvaluationInput,
): OutcomeEvaluation {
  assertInput(input);
  const { resources } = input;

  if (resources.stress <= 0) {
    return terminal('FAILED', 'STRESS_DEPLETED');
  }
  if (resources.coercion > input.coercionLimit) {
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
