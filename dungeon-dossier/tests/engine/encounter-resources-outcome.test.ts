import { describe, expect, it, vi } from 'vitest';

import {
  evaluateObjective,
  evaluateObjectives,
  hasSolvableRequiredObjectivePath,
  type ObjectiveDefinition,
  type ObjectiveEvaluationContext,
  type ObjectiveEvaluationSummary,
} from '../../src/engine/encounter/ObjectiveEvaluator';
import {
  evaluateOutcome,
  type OutcomeEvaluationInput,
} from '../../src/engine/encounter/OutcomeEvaluator';
import {
  applyResourceDelta,
  assertResourceInvariants,
  beginEncounterTurn,
  createResourceState,
  InsufficientCommandPointsError,
  processEncounterTurnStart,
  spendCommandPoints,
  type EncounterResourceLimits,
  type EncounterResourceState,
} from '../../src/engine/encounter/ResourceSystem';

const LIMITS: EncounterResourceLimits = {
  composureMax: 60,
  commandPointMax: 3,
  commandPointsPerTurn: 3,
  coercionLimit: 40,
  stressMax: 100,
  trustMax: 3,
};

function resources(
  overrides: Partial<EncounterResourceState> = {},
): EncounterResourceState {
  return {
    composure: 20,
    commandPoints: 3,
    coercion: 10,
    stress: 100,
    dp: 0,
    trust: 0,
    turn: 2,
    ...overrides,
  };
}

function objective(value: ObjectiveDefinition): ObjectiveDefinition {
  return value;
}

const CLAIMS: ObjectiveEvaluationContext['claims'] = [
  {
    claimId: 'claim-supported',
    commitment: 'COMMITTED',
    epistemic: 'SUPPORTED',
    presentation: 'NORMAL',
  },
  {
    claimId: 'claim-refuted',
    commitment: 'ASSERTED',
    epistemic: 'REFUTED',
    presentation: 'NORMAL',
  },
  {
    claimId: 'claim-hidden',
    commitment: 'UNSTATED',
    epistemic: 'UNKNOWN',
    presentation: 'HIDDEN',
  },
];

function objectiveContext(
  overrides: Partial<ObjectiveEvaluationContext> = {},
): ObjectiveEvaluationContext {
  return {
    claims: CLAIMS,
    evidence: [
      { evidenceId: 'evidence-intact', integrity: 'INTACT', acquired: true },
      {
        evidenceId: 'evidence-destroyed',
        integrity: 'DESTROYED',
        acquired: true,
      },
    ],
    resources: resources({ composure: 15, coercion: 10, turn: 3 }),
    damagedEntityIds: ['entity-damaged'],
    encounterFinished: true,
    encounterFailed: false,
    ...overrides,
  };
}

const COMPLETE_OBJECTIVES: ObjectiveEvaluationSummary = {
  required: [],
  optional: [],
  allRequiredCompleted: true,
  completedRequiredCount: 0,
  requiredCompletionRatio: 1,
};

function outcomeInput(
  overrides: Partial<OutcomeEvaluationInput> = {},
): OutcomeEvaluationInput {
  return {
    resources: resources(),
    objectives: COMPLETE_OBJECTIVES,
    coercionLimit: 40,
    turnLimit: 5,
    hasSolvablePath: true,
    bestConditions: { composureMin: 1, composureMax: 30, coercionMax: 40 },
    secureStatementRequested: false,
    ...overrides,
  };
}

describe('ResourceSystem', () => {
  it('creates a valid state and saturates resource changes at hard caps', () => {
    const initial = createResourceState(LIMITS, {
      composure: 999,
      commandPoints: 999,
      coercion: 999,
      stress: 999,
      dp: -1,
      trust: 999,
    });

    expect(initial).toEqual({
      composure: 60,
      commandPoints: 3,
      coercion: 100,
      stress: 100,
      dp: 0,
      trust: 3,
      turn: 0,
    });
    expect(() => assertResourceInvariants(initial, LIMITS)).not.toThrow();
  });

  it('lets coercion cross the encounter limit so outcome evaluation can fail it', () => {
    const next = applyResourceDelta(
      resources({ coercion: 39 }),
      { coercion: 5 },
      LIMITS,
    );

    expect(next.coercion).toBe(44);
    expect(next.coercion).toBeGreaterThan(LIMITS.coercionLimit);
    expect(() => assertResourceInvariants(next, LIMITS)).not.toThrow();
  });

  it('restores CP instead of adding it and advances one turn', () => {
    const next = beginEncounterTurn(
      resources({ commandPoints: 1, turn: 4 }),
      LIMITS,
    );
    expect(next.commandPoints).toBe(3);
    expect(next.turn).toBe(5);
  });

  it('applies a data-injected CP restore cap without knowing encounter identity', () => {
    const state = resources({ commandPoints: 0, turn: 0 });
    const capped = beginEncounterTurn(state, LIMITS, {
      commandPointRestoreCap: 2,
    });
    const uncapped = beginEncounterTurn(state, LIMITS);

    expect(capped.commandPoints).toBe(2);
    expect(uncapped.commandPoints).toBe(3);
  });

  it('runs draw, status ticks, and cooldown ticks in the pure turn-start operation', () => {
    const initial = {
      resources: resources({ commandPoints: 0, turn: 2 }),
      deck: {
        drawPile: ['card-alpha'],
        hand: [],
        discardPile: ['card-beta', 'card-gamma'],
      },
      statusDurations: { exposed: 1, guarded: 3 },
      cooldowns: { insight: 2, support: 1 },
    } as const;

    const result = processEncounterTurnStart(initial, LIMITS, {
      draw: { perTurn: 2, handLimit: 2, reshuffleOnEmpty: true },
      reorderDiscardPile: (cards) => [...cards].reverse(),
    });

    expect(result.state.resources).toMatchObject({ commandPoints: 3, turn: 3 });
    expect(result.drawnCardIds).toEqual(['card-alpha', 'card-gamma']);
    expect(result.state.deck).toEqual({
      drawPile: ['card-beta'],
      hand: ['card-alpha', 'card-gamma'],
      discardPile: [],
    });
    expect(result.state.statusDurations).toEqual({ guarded: 2 });
    expect(result.expiredStatusIds).toEqual(['exposed']);
    expect(result.state.cooldowns).toEqual({ insight: 1 });
    expect(result.readyCooldownIds).toEqual(['support']);
    expect(initial).toEqual({
      resources: resources({ commandPoints: 0, turn: 2 }),
      deck: {
        drawPile: ['card-alpha'],
        hand: [],
        discardPile: ['card-beta', 'card-gamma'],
      },
      statusDurations: { exposed: 1, guarded: 3 },
      cooldowns: { insight: 2, support: 1 },
    });
  });

  it('spends CP or throws a typed error without returning an invalid state', () => {
    expect(spendCommandPoints(resources(), 2, LIMITS).commandPoints).toBe(1);
    expect(() => spendCommandPoints(resources({ commandPoints: 1 }), 2, LIMITS)).toThrow(
      InsufficientCommandPointsError,
    );
  });

  it('rejects non-finite deltas', () => {
    expect(() =>
      applyResourceDelta(resources(), { stress: Number.NaN }, LIMITS),
    ).toThrow('stress delta must be finite');
  });
});

describe('ObjectiveEvaluator', () => {
  const completedCatalog: readonly ObjectiveDefinition[] = [
    objective({
      objective_id: 'resolve-supported',
      type: 'RESOLVE_CLAIM',
      claim_id: 'claim-supported',
    }),
    objective({
      objective_id: 'confirm-supported',
      type: 'CONFIRM_CLAIM',
      claim_id: 'claim-supported',
    }),
    objective({
      objective_id: 'refute-refuted',
      type: 'REFUTE_CLAIM',
      claim_id: 'claim-refuted',
    }),
    objective({
      objective_id: 'reveal-supported',
      type: 'REVEAL_CLAIM',
      claim_id: 'claim-supported',
    }),
    objective({
      objective_id: 'commit-supported',
      type: 'CREATE_COMMITMENT',
      claim_id: 'claim-supported',
    }),
    objective({
      objective_id: 'preserve-intact',
      type: 'PRESERVE_EVIDENCE',
      evidence_id: 'evidence-intact',
    }),
    objective({
      objective_id: 'reach-range',
      type: 'REACH_COMPOSURE_RANGE',
      min: 10,
      max: 15,
    }),
    objective({
      objective_id: 'keep-coercion',
      type: 'KEEP_COERCION_BELOW',
      max: 11,
    }),
    objective({
      objective_id: 'survive-turn',
      type: 'SURVIVE_UNTIL_TURN',
      turn: 3,
    }),
    objective({
      objective_id: 'finish-before',
      type: 'FINISH_BEFORE_TURN',
      turn: 4,
    }),
    objective({
      objective_id: 'protect-entity',
      type: 'PROTECT_ENTITY',
      entity_id: 'entity-safe',
    }),
    objective({
      objective_id: 'optional-discovery',
      type: 'OPTIONAL_DISCOVERY',
      claim_id: 'claim-supported',
    }),
  ];

  it.each(completedCatalog)('evaluates $type from its canonical runtime axis', (item) => {
    expect(evaluateObjective(item, objectiveContext())).toBe(true);
  });

  it('uses inclusive composure bounds and a strict coercion-below bound', () => {
    const composure = objective({
      objective_id: 'range-boundary',
      type: 'REACH_COMPOSURE_RANGE',
      min: 15,
      max: 20,
    });
    const coercion = objective({
      objective_id: 'coercion-boundary',
      type: 'KEEP_COERCION_BELOW',
      max: 10,
    });

    expect(evaluateObjective(composure, objectiveContext())).toBe(true);
    expect(evaluateObjective(coercion, objectiveContext())).toBe(false);
  });

  it('requires referenced state and honors damage, failure, and time conditions', () => {
    expect(
      evaluateObjective(
        objective({
          objective_id: 'missing-claim',
          type: 'CONFIRM_CLAIM',
          claim_id: 'claim-missing',
        }),
        objectiveContext(),
      ),
    ).toBe(false);
    expect(
      evaluateObjective(
        objective({
          objective_id: 'destroyed',
          type: 'PRESERVE_EVIDENCE',
          evidence_id: 'evidence-destroyed',
        }),
        objectiveContext(),
      ),
    ).toBe(false);
    expect(
      evaluateObjective(
        objective({
          objective_id: 'damaged',
          type: 'PROTECT_ENTITY',
          entity_id: 'entity-damaged',
        }),
        objectiveContext(),
      ),
    ).toBe(false);
    expect(
      evaluateObjective(
        objective({
          objective_id: 'failed-survival',
          type: 'SURVIVE_UNTIL_TURN',
          turn: 3,
        }),
        objectiveContext({ encounterFailed: true }),
      ),
    ).toBe(false);
  });

  it('summarizes required and optional completion without mutating objectives', () => {
    const definitions = {
      required: [completedCatalog[0]!, objective({
        objective_id: 'hidden-reveal',
        type: 'REVEAL_CLAIM',
        claim_id: 'claim-hidden',
      })],
      optional: [completedCatalog[11]!],
      state_conditions: { composure_min: 1, composure_max: 30 },
    };
    const summary = evaluateObjectives(definitions, objectiveContext());

    expect(summary.completedRequiredCount).toBe(1);
    expect(summary.requiredCompletionRatio).toBe(0.5);
    expect(summary.allRequiredCompleted).toBe(false);
    expect(summary.optional[0]?.completed).toBe(true);
  });

  it('requires a solvable proof path only for incomplete required objectives', () => {
    const definitions = {
      required: [completedCatalog[0]!, objective({
        objective_id: 'unresolved-hidden',
        type: 'RESOLVE_CLAIM',
        claim_id: 'claim-hidden',
      })],
      optional: [],
      state_conditions: { composure_min: 1, composure_max: 30 },
    };
    const summary = evaluateObjectives(definitions, objectiveContext());
    const noPath = vi.fn(() => false);

    expect(hasSolvableRequiredObjectivePath(summary.required, noPath)).toBe(false);
    expect(noPath).toHaveBeenCalledTimes(1);
    expect(noPath).toHaveBeenCalledWith(definitions.required[1]);
    expect(
      hasSolvableRequiredObjectivePath(summary.required, () => true),
    ).toBe(true);
  });
});

describe('OutcomeEvaluator exact ordering', () => {
  it('chooses FAILED before COERCED when stress is depleted', () => {
    const result = evaluateOutcome(
      outcomeInput({ resources: resources({ stress: 0, composure: 0 }) }),
    );
    expect(result).toMatchObject({
      terminalOutcome: 'FAILED',
      terminal: true,
      reason: 'STRESS_DEPLETED',
    });
  });

  it('chooses FAILED before COERCED when coercion exceeds the encounter limit', () => {
    const result = evaluateOutcome(
      outcomeInput({ resources: resources({ coercion: 41, composure: 0 }) }),
    );
    expect(result).toMatchObject({
      terminalOutcome: 'FAILED',
      reason: 'COERCION_LIMIT_EXCEEDED',
    });
  });

  it('chooses FAILED before BEST when the turn has exceeded the limit', () => {
    const result = evaluateOutcome(
      outcomeInput({
        resources: resources({ turn: 6 }),
        secureStatementRequested: true,
      }),
    );
    expect(result).toMatchObject({
      terminalOutcome: 'FAILED',
      reason: 'TURN_LIMIT_EXCEEDED',
    });
  });

  it('fails immediately with NO_SOLVABLE_PATH before checking composure', () => {
    const result = evaluateOutcome(
      outcomeInput({
        resources: resources({ composure: 0 }),
        hasSolvablePath: false,
      }),
    );
    expect(result).toMatchObject({
      terminalOutcome: 'FAILED',
      reason: 'NO_SOLVABLE_PATH',
    });
  });

  it('returns COERCED only for zero composure after all failure checks pass', () => {
    const result = evaluateOutcome(
      outcomeInput({ resources: resources({ composure: 0 }) }),
    );
    expect(result).toMatchObject({
      terminalOutcome: 'COERCED_CONFESSION',
      reason: 'COMPOSURE_DEPLETED',
    });
  });

  it('unlocks Secure Statement without producing a terminal outcome', () => {
    const result = evaluateOutcome(outcomeInput());

    expect(result).toEqual({
      terminalOutcome: null,
      terminal: false,
      bestResolution: {
        conditionsMet: true,
        secureStatementEnabled: true,
      },
      reason: 'BEST_AVAILABLE',
    });
  });

  it('produces BEST only after the explicit Secure Statement selection', () => {
    const result = evaluateOutcome(
      outcomeInput({ secureStatementRequested: true }),
    );
    expect(result).toEqual({
      terminalOutcome: 'BEST_RESOLUTION',
      terminal: true,
      bestResolution: {
        conditionsMet: true,
        secureStatementEnabled: false,
      },
      reason: 'BEST_CONFIRMED',
    });
  });

  it('treats encounter coercion limit equality as safe', () => {
    const result = evaluateOutcome(
      outcomeInput({ resources: resources({ coercion: 40 }) }),
    );
    expect(result.terminalOutcome).toBeNull();
    expect(result.bestResolution.secureStatementEnabled).toBe(true);
  });

  it('uses PARTIAL at the exact turn limit when BEST is not selected', () => {
    const result = evaluateOutcome(
      outcomeInput({ resources: resources({ turn: 5 }) }),
    );
    expect(result).toEqual({
      terminalOutcome: 'PARTIAL_RESOLUTION',
      terminal: true,
      bestResolution: {
        conditionsMet: true,
        secureStatementEnabled: false,
      },
      reason: 'TURN_LIMIT_REACHED',
    });
  });

  it('honors explicit BEST confirmation before PARTIAL at the exact limit', () => {
    const result = evaluateOutcome(
      outcomeInput({
        resources: resources({ turn: 5 }),
        secureStatementRequested: true,
      }),
    );
    expect(result.terminalOutcome).toBe('BEST_RESOLUTION');
  });

  it('does not unlock BEST until every required objective is complete', () => {
    const result = evaluateOutcome(
      outcomeInput({
        objectives: { ...COMPLETE_OBJECTIVES, allRequiredCompleted: false },
      }),
    );
    expect(result).toMatchObject({
      terminalOutcome: null,
      bestResolution: {
        conditionsMet: false,
        secureStatementEnabled: false,
      },
      reason: 'NONE',
    });
  });
});
