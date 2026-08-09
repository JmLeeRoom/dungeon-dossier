import { describe, expect, it } from 'vitest';

import { EncounterInvariantError } from '../../src/engine/encounter/EncounterInvariantError';
import type { ObjectiveEvaluationSummary } from '../../src/engine/encounter/ObjectiveEvaluator';
import {
  EMPTY_TERMINAL_THRESHOLD_FACTS,
  evaluateSettlementDirective,
  isBestResolutionEligible,
  observeTerminalThresholds,
  reduceTerminalThresholdFacts,
  type SettlementDirectiveInput,
  type TerminalThresholdFacts,
} from '../../src/engine/encounter/OutcomeEvaluator';
import type { EncounterResourceState } from '../../src/engine/encounter/ResourceSystem';

const COMPLETE_OBJECTIVES: ObjectiveEvaluationSummary = {
  required: [],
  optional: [],
  allRequiredCompleted: true,
  completedRequiredCount: 0,
  requiredCompletionRatio: 1,
};

function resources(
  overrides: Partial<EncounterResourceState> = {},
): EncounterResourceState {
  return {
    composure: 15,
    commandPoints: 1,
    coercion: 10,
    stress: 100,
    dp: 0,
    trust: 0,
    turn: 2,
    ...overrides,
  };
}

function facts(
  overrides: Partial<TerminalThresholdFacts> = {},
): TerminalThresholdFacts {
  return { ...EMPTY_TERMINAL_THRESHOLD_FACTS, ...overrides };
}

function directiveInput(
  overrides: Partial<SettlementDirectiveInput> = {},
): SettlementDirectiveInput {
  return {
    thresholdFacts: facts(),
    authoredForcedOutcome: null,
    hasSolvablePath: true,
    resources: resources(),
    objectives: COMPLETE_OBJECTIVES,
    bestConditions: { composureMin: 0.6, composureMax: 18 },
    coercionLimit: 100,
    turnsSpent: 2,
    turnLimit: 5,
    ...overrides,
  };
}

describe('TerminalThresholdFacts', () => {
  it('ORs each threshold in and never clears an already-true bit', () => {
    const afterHit = observeTerminalThresholds(
      EMPTY_TERMINAL_THRESHOLD_FACTS,
      { stress: 0, coercion: 30, composure: 12 },
      100,
    );
    expect(afterHit).toEqual({
      hpDepleted: true,
      coercionLimitReached: false,
      composureDepleted: false,
    });

    // A later phase in the same transaction heals HP: the fact must survive.
    const afterRecovery = observeTerminalThresholds(
      afterHit,
      { stress: 40, coercion: 100, composure: 0 },
      100,
    );
    expect(afterRecovery).toEqual({
      hpDepleted: true,
      coercionLimitReached: true,
      composureDepleted: true,
    });
  });

  it('treats the coercion limit itself as reached, matching outcome rules', () => {
    const atLimit = observeTerminalThresholds(
      EMPTY_TERMINAL_THRESHOLD_FACTS,
      { stress: 10, coercion: 40, composure: 5 },
      40,
    );
    expect(atLimit.coercionLimitReached).toBe(true);

    const belowLimit = observeTerminalThresholds(
      EMPTY_TERMINAL_THRESHOLD_FACTS,
      { stress: 10, coercion: 39, composure: 5 },
      40,
    );
    expect(belowLimit.coercionLimitReached).toBe(false);
  });

  it('reduces facts as HP failure, then coercion failure, then coerced confession', () => {
    expect(
      reduceTerminalThresholdFacts(
        facts({ hpDepleted: true, coercionLimitReached: true, composureDepleted: true }),
      ),
    ).toEqual({ outcome: 'FAILED', reason: 'STRESS_DEPLETED' });
    expect(
      reduceTerminalThresholdFacts(
        facts({ coercionLimitReached: true, composureDepleted: true }),
      ),
    ).toEqual({ outcome: 'FAILED', reason: 'COERCION_LIMIT_EXCEEDED' });
    expect(
      reduceTerminalThresholdFacts(facts({ composureDepleted: true })),
    ).toEqual({ outcome: 'COERCED_CONFESSION', reason: 'COMPOSURE_DEPLETED' });
    expect(reduceTerminalThresholdFacts(facts())).toBeNull();
  });
});

describe('evaluateSettlementDirective priority', () => {
  it('turns any threshold fact into a terminal without opening the decision', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({ thresholdFacts: facts({ hpDepleted: true }) }),
    );
    expect(directive).toEqual({
      kind: 'TERMINAL',
      outcome: 'FAILED',
      reason: 'STRESS_DEPLETED',
    });
  });

  it('prefers threshold facts over an authored forced outcome', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({
        thresholdFacts: facts({ coercionLimitReached: true }),
        authoredForcedOutcome: 'BEST_RESOLUTION',
      }),
    );
    expect(directive).toEqual({
      kind: 'TERMINAL',
      outcome: 'FAILED',
      reason: 'COERCION_LIMIT_EXCEEDED',
    });
  });

  it('applies an authored forced outcome before path-loss failure', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({
        authoredForcedOutcome: 'PARTIAL_RESOLUTION',
        hasSolvablePath: false,
      }),
    );
    expect(directive).toEqual({
      kind: 'TERMINAL',
      outcome: 'PARTIAL_RESOLUTION',
      reason: 'NONE',
    });
  });

  it('lets the composure-zero fact beat NO_SOLVABLE_PATH, unlike the legacy order', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({
        thresholdFacts: facts({ composureDepleted: true }),
        hasSolvablePath: false,
      }),
    );
    expect(directive).toEqual({
      kind: 'TERMINAL',
      outcome: 'COERCED_CONFESSION',
      reason: 'COMPOSURE_DEPLETED',
    });
  });

  it('fails with NO_SOLVABLE_PATH when no fact and no authored outcome exist', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({ hasSolvablePath: false }),
    );
    expect(directive).toEqual({
      kind: 'TERMINAL',
      outcome: 'FAILED',
      reason: 'NO_SOLVABLE_PATH',
    });
  });

  it('offers the secure decision mid-run with a next-turn decline', () => {
    const directive = evaluateSettlementDirective(directiveInput());
    expect(directive).toEqual({
      kind: 'OFFER_SECURE_DECISION',
      onDecline: 'START_NEXT_TURN',
    });
  });

  it('keeps the final-turn sweet spot as a decision that declines into PARTIAL', () => {
    // v2 fixed priority: the decision outranks turn exhaustion, so the last
    // allowed turn can still secure BEST; declining resolves as PARTIAL.
    const directive = evaluateSettlementDirective(
      directiveInput({ turnsSpent: 5 }),
    );
    expect(directive).toEqual({
      kind: 'OFFER_SECURE_DECISION',
      onDecline: 'PARTIAL_RESOLUTION',
    });
  });

  it('exhausts into PARTIAL only without BEST eligibility', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({
        turnsSpent: 5,
        objectives: { ...COMPLETE_OBJECTIVES, allRequiredCompleted: false },
      }),
    );
    expect(directive).toEqual({
      kind: 'TERMINAL',
      outcome: 'PARTIAL_RESOLUTION',
      reason: 'TURN_LIMIT_REACHED',
    });
  });

  it('starts the next turn when nothing is terminal, eligible, or exhausted', () => {
    const directive = evaluateSettlementDirective(
      directiveInput({
        objectives: { ...COMPLETE_OBJECTIVES, allRequiredCompleted: false },
      }),
    );
    expect(directive).toEqual({ kind: 'START_NEXT_TURN' });
  });

  it('rejects an over-limit turnsSpent as an engine invariant violation', () => {
    expect(() =>
      evaluateSettlementDirective(directiveInput({ turnsSpent: 6 })),
    ).toThrow(EncounterInvariantError);
  });
});

describe('isBestResolutionEligible', () => {
  it('requires objectives, the sweet-spot range, and both coercion guards', () => {
    expect(isBestResolutionEligible(directiveInput())).toBe(true);
    expect(
      isBestResolutionEligible(
        directiveInput({
          objectives: { ...COMPLETE_OBJECTIVES, allRequiredCompleted: false },
        }),
      ),
    ).toBe(false);
    expect(
      isBestResolutionEligible(
        directiveInput({ resources: resources({ composure: 19 }) }),
      ),
    ).toBe(false);
    expect(
      isBestResolutionEligible(
        directiveInput({ resources: resources({ composure: 0 }) }),
      ),
    ).toBe(false);
    expect(
      isBestResolutionEligible(
        directiveInput({ resources: resources({ coercion: 100 }) }),
      ),
    ).toBe(false);
    expect(
      isBestResolutionEligible(
        directiveInput({
          bestConditions: { composureMin: 0.6, composureMax: 18, coercionMax: 9 },
        }),
      ),
    ).toBe(false);
    expect(
      isBestResolutionEligible(
        directiveInput({
          bestConditions: { composureMin: 0.6, composureMax: 18, coercionMax: 10 },
        }),
      ),
    ).toBe(true);
  });
});
