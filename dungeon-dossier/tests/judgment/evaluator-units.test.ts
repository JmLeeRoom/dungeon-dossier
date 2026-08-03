import { describe, expect, it } from 'vitest';
import {
  applyResolution,
  countIndependentSources,
  evaluateRelation,
  hasSolvableProofPath,
  resolveArgument,
  timeConflicts,
} from '../../src/engine/resolution';
import { claim, evidence, input, rule } from './fixtures';

describe('pure evaluator units', () => {
  it('detects overlap and an impossible travel gap deterministically', () => {
    expect(
      timeConflicts({ from: 100, to: 200 }, { from: 150, to: 250 }),
    ).toBe(true);
    expect(
      timeConflicts({ from: 100, to: 200 }, { from: 260, to: 300 }, 90),
    ).toBe(true);
    expect(
      timeConflicts({ from: 100, to: 200 }, { from: 400, to: 500 }, 90),
    ).toBe(false);
  });

  it('lets a conflicting place and time dominate an incidental identity match', () => {
    const target = claim({
      subjectId: 'same-actor',
      locationId: 'first-place',
      timeRange: { from: 100, to: 200 },
    });
    const item = evidence('ev_unit_relation', ['IDENTITY', 'TIME', 'LOCATION']);
    const observation = {
      predicate: 'OBSERVATION',
      scopes: ['IDENTITY', 'TIME', 'LOCATION'] as const,
      confidence: 0.95,
      subjectId: 'same-actor',
      locationId: 'second-place',
      timeRange: { from: 150, to: 160 },
    };

    expect(
      evaluateRelation(target, [{ ...item, observations: [observation] }], 'FULL'),
    ).toBe('CONTRADICTS');
  });

  it('does not treat the same actor and place at another time as support', () => {
    const target = claim({
      subjectId: 'same-actor',
      locationId: 'same-place',
      timeRange: { from: 100, to: 200 },
    });
    const item = evidence('ev_unit_other_time', ['IDENTITY', 'TIME', 'LOCATION']);
    const observation = {
      predicate: 'OBSERVATION',
      scopes: ['IDENTITY', 'TIME', 'LOCATION'] as const,
      confidence: 0.95,
      subjectId: 'same-actor',
      locationId: 'same-place',
      timeRange: { from: 400, to: 500 },
    };

    expect(
      evaluateRelation(target, [{ ...item, observations: [observation] }], 'FULL'),
    ).toBe('NEUTRAL');
  });

  it('keeps an earlier observation outside the travel window non-conflicting', () => {
    const target = claim({
      subjectId: 'same-actor',
      locationId: 'home',
      timeRange: { from: 100, to: 200 },
    });
    const item = evidence('ev_unit_earlier', ['TIME', 'LOCATION']);
    const observation = {
      predicate: 'OBSERVATION',
      scopes: ['TIME', 'LOCATION'] as const,
      confidence: 0.95,
      subjectId: 'same-actor',
      locationId: 'restaurant',
      timeRange: { from: 0, to: 20 },
      travelTimeMinSeconds: 30,
    };

    expect(
      evaluateRelation(target, [{ ...item, observations: [observation] }], 'PARTIAL'),
    ).toBe('AMBIGUOUS');
  });

  it('combines a separately submitted minimum-travel observation', () => {
    const target = claim({
      locationId: 'first-place',
      timeRange: { from: 100, to: 200 },
    });
    const sighting = evidence('ev_unit_sighting', ['TIME', 'LOCATION']);
    const travelRecord = evidence('ev_unit_travel', ['ROUTE']);

    expect(
      evaluateRelation(
        target,
        [
          {
            ...sighting,
            observations: [
              {
                predicate: 'OBSERVATION',
                scopes: ['TIME', 'LOCATION'],
                confidence: 0.95,
                locationId: 'second-place',
                timeRange: { from: 250, to: 260 },
              },
            ],
          },
          {
            ...travelRecord,
            observations: [
              {
                predicate: 'TRAVEL_TIME_MIN',
                scopes: ['ROUTE'],
                confidence: 0.95,
                travelTimeMinSeconds: 90,
              },
            ],
          },
        ],
        'FULL',
      ),
    ).toBe('CONTRADICTS');
  });

  it('collapses derived evidence to its root source', () => {
    const root = evidence('ev_unit_root', ['ACTION'], {
      sourceId: 'origin', group: 'DOCUMENT',
    });
    const derived = evidence('ev_unit_derived', ['ACTION'], {
      sourceId: 'copy', group: 'DIGITAL', derivedFrom: 'ev_unit_root',
    });
    expect(countIndependentSources([root, derived], [root, derived], 0.5)).toBe(1);
  });

  it('rejects a derived-evidence parent missing from the supplied catalogue', () => {
    const derived = evidence('ev_unit_orphan', ['ACTION'], {
      derivedFrom: 'ev_unit_missing_parent',
    });
    expect(() => countIndependentSources([derived], [derived], 0.5)).toThrow(
      'Missing derived evidence parent',
    );
  });

  it('caps Grade-C-only proof at provisional', () => {
    const item = evidence('ev_unit_low_grade', ['ACTION'], {
      grade: 'C', contradicts: true,
    });
    const result = resolveArgument(input(rule(['ACTION']), [item]));
    expect(result.axes.sufficiency).toBe('PROVISIONAL');
    expect(result.code).toBe('R_INDIRECT_SUSPICION');
  });

  it('evaluates guaranteed-set integrity from that set, not unrelated extras', () => {
    const guaranteed = evidence('ev_unit_guaranteed', ['ACTION'], {
      contradicts: true,
    });
    const degradedExtra = evidence('ev_unit_degraded_extra', ['ACTION'], {
      integrity: 'DEGRADED',
    });
    const result = resolveArgument(
      input(
        rule(['ACTION'], {
          guaranteed: [['ev_unit_guaranteed']],
          requireIntegrity: true,
        }),
        [guaranteed, degradedExtra],
      ),
    );

    expect(result.axes.sufficiency).toBe('SUFFICIENT');
    expect(result.code).toBe('R_DIRECT_CONTRADICTION');
  });

  it('rejects a proof rule for another claim or action direction', () => {
    const item = evidence('ev_unit_rule_target', ['ACTION'], { contradicts: true });
    const wrongTarget = resolveArgument(
      input({ ...rule(['ACTION']), targetClaimId: 'another-claim' }, [item]),
    );
    const wrongDirection = resolveArgument(
      input({ ...rule(['ACTION']), direction: 'SUPPORT' }, [item]),
    );

    expect(wrongTarget).toMatchObject({
      code: 'R_ACTION_INVALID',
      reason: 'INCOMPATIBLE_TARGET',
    });
    expect(wrongDirection).toMatchObject({
      code: 'R_ACTION_INVALID',
      reason: 'INCOMPATIBLE_TARGET',
    });
  });

  it('maps reachable weak and directionless combinations without falling through', () => {
    const weakContradiction = evidence('ev_unit_weak', ['ACTION'], {
      confidence: 0.2,
      contradicts: true,
    });
    expect(resolveArgument(input(rule(['ACTION']), [weakContradiction])).code).toBe(
      'R_INSUFFICIENT_GROUNDS',
    );

    const partialSupport = evidence('ev_unit_partial_confirm', ['ACTION'], {
      supports: true,
    });
    expect(
      resolveArgument(
        input(
          rule(['ACTION', 'TIME'], { direction: 'SUPPORT' }),
          [partialSupport],
          { intent: 'CONFIRM' },
        ),
      ).code,
    ).toBe('R_INSUFFICIENT_GROUNDS');

    const support = evidence('ev_unit_unmet_confirm', ['ACTION'], { supports: true });
    expect(
      resolveArgument(
        input(
          rule(['ACTION'], { direction: 'SUPPORT', minimumSources: 2 }),
          [support],
          { intent: 'CONFIRM' },
        ),
      ).code,
    ).toBe('R_CONFIRM_PROVISIONAL');

    const directionless = evidence('ev_unit_directionless', ['ACTION']);
    expect(resolveArgument(input(rule(['ACTION']), [directionless])).code).toBe(
      'R_INSUFFICIENT_GROUNDS',
    );
  });

  it('keeps alternate hypotheses separate from proof sufficiency', () => {
    const item = evidence('ev_unit_hypothesis', ['ACTION'], { contradicts: true });
    const baseRule = rule(['ACTION']);
    const result = resolveArgument(
      input(
        {
          ...baseRule,
          requirements: {
            ...baseRule.requirements,
            eliminateHypotheses: ['hypothesis-not-cleared'],
          },
        },
        [item],
      ),
    );

    expect(result.axes).toMatchObject({
      sufficiency: 'SUFFICIENT',
      hypotheses: 'REMAINING',
    });
    expect(result.code).toBe('R_INDIRECT_SUSPICION');
  });

  it('clears an explicit alternate hypothesis with its disqualifying set', () => {
    const item = evidence('ev_unit_hypothesis_clear', ['ACTION'], {
      contradicts: true,
    });
    const baseRule = rule(['ACTION']);
    const result = resolveArgument(
      input(
        {
          ...baseRule,
          alternateHypotheses: [
            {
              hypothesisId: 'hypothesis-cleared',
              disqualifyingEvidenceSets: [['ev_unit_hypothesis_clear']],
            },
          ],
        },
        [item],
      ),
    );

    expect(result.axes.hypotheses).toBe('CLEARED');
    expect(result.code).toBe('R_DIRECT_CONTRADICTION');
  });

  it('requires an intact guaranteed set for an alternate solvable path', () => {
    const item = evidence('ev_unit_path', ['ACTION'], { contradicts: true });
    expect(hasSolvableProofPath([rule(['ACTION'])], [item])).toBe(false);
    expect(
      hasSolvableProofPath(
        [rule(['ACTION'], { guaranteed: [['ev_unit_path']] })],
        [item],
      ),
    ).toBe(true);
    expect(
      hasSolvableProofPath(
        [rule(['ACTION'], { guaranteed: [['ev_unit_path']] })],
        [{ ...item, integrity: 'DESTROYED' }],
      ),
    ).toBe(false);
  });

  it('applies the committed direct-contradiction multiplier', () => {
    const item = evidence('ev_unit_committed', ['ACTION'], { contradicts: true });
    const result = resolveArgument(
      input(rule(['ACTION']), [item], {
        target: claim({ commitment: 'COMMITTED' }),
      }),
    );
    expect(result.effects.composureDelta).toBeCloseTo(-25.2);
    expect(result.effects.phaseTransitionWeight).toBe(2);
  });

  it('applies the declared command-point cost through the sole state boundary', () => {
    const item = evidence('ev_unit_cost', ['ACTION'], { contradicts: true });
    const target = claim();
    const result = resolveArgument(
      input(rule(['ACTION']), [item], {
        target,
        commandPointCost: 2,
      }),
    );

    const next = applyResolution(
      result,
      {
        resources: { composure: 100, coercion: 0, commandPoints: 3 },
        claims: {
          [target.claimId]: {
            commitment: target.commitment,
            epistemic: target.epistemic,
            presentation: target.presentation,
            resistance: 1,
            isRequired: false,
          },
        },
        revealedIds: [],
        appliedCardEffects: [],
        appliedModifierEffects: [],
        objectivesDirty: false,
      },
      target.claimId,
    );

    expect(next.resources.commandPoints).toBe(1);
    expect(next.resources.composure).toBeCloseTo(82);
    expect(next.claims[target.claimId]?.epistemic).toBe('REFUTED');
    expect(next.objectivesDirty).toBe(true);
  });

  it('rechecks an alternate path when a required claim enters unresolved', () => {
    const item = evidence('ev_unit_unresolved', ['ACTION'], { contradicts: true });
    const target = claim();
    const resolved = resolveArgument(input(rule(['ACTION']), [item], { target }));
    const unresolved = {
      ...resolved,
      effects: { ...resolved.effects, epistemicState: 'UNRESOLVED' as const },
    };
    const state = {
      resources: { composure: 100, coercion: 0, commandPoints: 3 },
      claims: {
        [target.claimId]: {
          commitment: target.commitment,
          epistemic: target.epistemic,
          presentation: target.presentation,
          resistance: 1,
          isRequired: true,
        },
      },
      revealedIds: [],
      appliedCardEffects: [],
      appliedModifierEffects: [],
      objectivesDirty: false,
    } as const;

    expect(() => applyResolution(unresolved, state, target.claimId)).toThrow('I-4');
    expect(
      applyResolution(unresolved, state, target.claimId, {
        hasAlternativePath: () => true,
      }).claims[target.claimId]?.epistemic,
    ).toBe('UNRESOLVED');
  });
});
