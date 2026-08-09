import { describe, expect, it } from 'vitest';

import {
  addResourceDeltas,
  computeResourceDelta,
  createDecisionId,
  ENCOUNTER_RESOURCE_DELTA_KEYS,
  isZeroResourceDelta,
  zeroResourceDelta,
} from '../../src/engine/encounter/SubmitTransaction';
import type { EncounterResourceState } from '../../src/engine/encounter/ResourceSystem';

function resources(
  overrides: Partial<EncounterResourceState> = {},
): EncounterResourceState {
  return {
    composure: 40,
    commandPoints: 3,
    coercion: 10,
    stress: 80,
    dp: 1,
    trust: 0,
    turn: 2,
    ...overrides,
  };
}

describe('ResourceDelta', () => {
  it('covers every resource key and preserves zeros', () => {
    const delta = computeResourceDelta(
      resources(),
      resources({ composure: 30, coercion: 12 }),
    );

    // Compare against a real state's keys, not the module's own constant, so
    // a resource added to EncounterResourceState cannot silently drop out of
    // the delta contract.
    const stateKeys = Object.keys(resources()).filter((key) => key !== 'turn');
    expect(Object.keys(delta).sort()).toEqual(stateKeys.sort());
    expect([...ENCOUNTER_RESOURCE_DELTA_KEYS].sort()).toEqual(stateKeys.sort());
    expect(delta).toEqual({
      composure: -10,
      commandPoints: 0,
      coercion: 2,
      stress: 0,
      dp: 0,
      trust: 0,
    });
  });

  it('excludes the turn counter from the delta contract', () => {
    expect(ENCOUNTER_RESOURCE_DELTA_KEYS).not.toContain('turn');
    const delta = computeResourceDelta(
      resources({ turn: 1 }),
      resources({ turn: 2 }),
    );
    expect(isZeroResourceDelta(delta)).toBe(true);
  });

  it('sums disjoint phase deltas into the end-to-end change', () => {
    const preSubmit = resources();
    const impact = resources({ composure: 25, commandPoints: 1, coercion: 15 });
    const settled = resources({ composure: 25, commandPoints: 1, coercion: 17, stress: 75 });
    const committed = resources({ composure: 25, commandPoints: 3, coercion: 17, stress: 75 });

    const action = computeResourceDelta(preSubmit, impact);
    const turnEnd = computeResourceDelta(impact, settled);
    const turnStart = computeResourceDelta(settled, committed);
    const total = addResourceDeltas(action, turnEnd, zeroResourceDelta(), turnStart);

    expect(total).toEqual(computeResourceDelta(preSubmit, committed));
  });

  // Scoped to the decision arm: a TerminalCommit's turn-start delta is only
  // all-zero on settlement paths, not on the ON_TURN_START_PRE_DRAW terminal.
  it('reports the all-zero delta used by the secure-decision commit arm', () => {
    expect(isZeroResourceDelta(zeroResourceDelta())).toBe(true);
    expect(
      isZeroResourceDelta(computeResourceDelta(resources(), resources({ dp: 2 }))),
    ).toBe(false);
  });

  it('rejects a non-finite resource change instead of storing it', () => {
    expect(() =>
      computeResourceDelta(
        resources(),
        resources({ stress: Number.POSITIVE_INFINITY }),
      ),
    ).toThrow('must be finite');
  });
});

describe('createDecisionId', () => {
  it('is deterministic for the same checkpoint', () => {
    expect(createDecisionId('run-7:node_slime:1', 3, 12)).toBe(
      'run-7:node_slime:1:3:12',
    );
    expect(createDecisionId('run-7:node_slime:1', 3, 12)).toBe(
      createDecisionId('run-7:node_slime:1', 3, 12),
    );
  });

  it('changes whenever the attempt, turn, or accepted revision changes', () => {
    const base = createDecisionId('run-7:node_slime:1', 3, 12);
    expect(createDecisionId('run-7:node_slime:2', 3, 12)).not.toBe(base);
    expect(createDecisionId('run-7:node_slime:1', 4, 12)).not.toBe(base);
    expect(createDecisionId('run-7:node_slime:1', 3, 13)).not.toBe(base);
  });

  it('validates its inputs', () => {
    expect(() => createDecisionId('', 0, 0)).toThrow('non-empty');
    expect(() => createDecisionId('attempt', -1, 0)).toThrow('turnsSpent');
    expect(() => createDecisionId('attempt', 0, 1.5)).toThrow('sourceRevision');
  });
});
