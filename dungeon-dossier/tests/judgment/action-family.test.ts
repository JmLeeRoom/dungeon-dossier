import { describe, expect, it } from 'vitest';
import {
  applyResolution,
  resolveArgument,
  type ResolutionInput,
} from '../../src/engine/resolution';
import { claim, input, rule } from './fixtures';

function action(overrides: Partial<ResolutionInput>): ResolutionInput {
  return input(rule(['ACTION']), [], {
    intent: 'RECOVER',
    targetKind: 'SELF',
    target: claim(),
    ...overrides,
  });
}

describe('adopted action families', () => {
  it.each([
    ['QUERY', 'ROUTE', { routeAvailable: true }, 'R_QUERY_SUCCESS'],
    ['QUERY', 'ROUTE', { routeAvailable: false }, 'R_QUERY_BLOCKED'],
    ['CLARIFY', 'CLAIM', { clarifiable: true }, 'R_CLARIFY_SUCCESS'],
    ['CLARIFY', 'CLAIM', { clarifiable: false }, 'R_CLARIFY_NOOP'],
    ['COMMIT', 'CLAIM', {}, 'R_COMMIT_SUCCESS'],
    ['FORENSIC', 'EVIDENCE', {}, 'R_FORENSIC_REVEALED'],
    ['PRESSURE', 'CLAIM', {}, 'R_PRESSURE_APPLIED'],
    ['PRESSURE', 'CLAIM', { pressureBackfire: true }, 'R_PRESSURE_BACKFIRE'],
    ['RECOVER', 'SELF', {}, 'R_RECOVER_APPLIED'],
    ['SPECIAL', 'SPECIAL', {}, 'R_SPECIAL_APPLIED'],
  ] as const)('%s resolves to %s', (intent, targetKind, actionContext, expected) => {
    const result = resolveArgument(action({ intent, targetKind, actionContext }));
    expect(result.code).toBe(expected);
    expect(result.trace).toEqual([
      'ACTION_COMPATIBILITY', 'TARGET_EXPOSURE', 'PROCEDURE', 'LOOKUP',
    ]);
  });

  it('keeps CROSS_CHECK reserved and unimplemented', () => {
    const result = resolveArgument(action({ intent: 'CROSS_CHECK', targetKind: 'CLAIM' }));
    expect(result.code).toBe('R_ACTION_INVALID');
    expect(result.reason).toBe('RESERVED_INTENT');
  });

  it('carries action-family resources, reveals, and card effects to the applier', () => {
    const cardEffect = { type: 'DRAW_CARD' as const, target: 'runtime-card' };
    const result = resolveArgument(
      action({
        intent: 'QUERY',
        targetKind: 'ROUTE',
        actionContext: {
          routeAvailable: true,
          reveals: ['runtime-claim'],
          composureDelta: -4,
          coercionDelta: 2,
          cardEffects: [cardEffect],
        },
      }),
    );
    const next = applyResolution(result, {
      resources: { composure: 20, coercion: 0, commandPoints: 2 },
      claims: {},
      revealedIds: [],
      appliedCardEffects: [],
      appliedModifierEffects: [],
      objectivesDirty: false,
    });

    expect(next.resources).toEqual({ composure: 16, coercion: 2, commandPoints: 1 });
    expect(next.revealedIds).toEqual(['runtime-claim']);
    expect(next.appliedCardEffects).toEqual([cardEffect]);
  });

  it('applies CLARIFY presentation recovery without changing deduction axes', () => {
    const target = claim({ presentation: 'DISTORTED' });
    const result = resolveArgument(
      action({
        intent: 'CLARIFY',
        targetKind: 'CLAIM',
        target,
        actionContext: { clarifiable: true, presentationState: 'NORMAL' },
      }),
    );
    const next = applyResolution(
      result,
      {
        resources: { composure: 20, coercion: 0, commandPoints: 2 },
        claims: {
          [target.claimId]: {
            commitment: target.commitment,
            epistemic: target.epistemic,
            presentation: target.presentation,
            resistance: 2,
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

    expect(next.claims[target.claimId]).toMatchObject({
      commitment: target.commitment,
      epistemic: target.epistemic,
      presentation: 'NORMAL',
    });
  });

  it('invalidates COMMIT outside ASSERTED and weakens resistance only on refusal', () => {
    const invalid = resolveArgument(
      action({
        intent: 'COMMIT',
        targetKind: 'CLAIM',
        target: claim({ commitment: 'COMMITTED' }),
      }),
    );
    expect(invalid).toMatchObject({
      code: 'R_ACTION_INVALID',
      reason: 'INCOMPATIBLE_TARGET',
      effects: { commandPointDelta: 0 },
    });

    const refused = resolveArgument(
      action({
        intent: 'COMMIT',
        targetKind: 'CLAIM',
        target: claim({ commitment: 'ASSERTED' }),
        actionContext: { resistanceExceeded: true },
      }),
    );
    expect(refused.code).toBe('R_COMMIT_REFUSED');
    expect(refused.effects.resistanceDelta).toBe(-1);
  });

  it('lets a forbidden procedure override a valid action after validation', () => {
    const result = resolveArgument(action({ procedure: 'FORBIDDEN' }));
    expect(result.code).toBe('R_PROCEDURE_VIOLATION');
    expect(result.effects.terminalOutcome).toBe('FAILED');
  });
});
