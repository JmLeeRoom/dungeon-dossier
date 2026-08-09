import { describe, expect, it } from 'vitest';

import { evaluateRunFailure } from '../../src/engine/run/RunState';

describe('global HP failure', () => {
  it('ends the run wherever HP reaches zero, not only in an interrogation', () => {
    // HP is the detective's own life. An event cost drains it exactly as a lost
    // interrogation does, so the check cannot live inside the encounter.
    const alive = { stress: 1 } as Parameters<typeof evaluateRunFailure>[0];
    const spent = { stress: 0 } as Parameters<typeof evaluateRunFailure>[0];
    const overdrawn = { stress: -3 } as Parameters<typeof evaluateRunFailure>[0];

    expect(evaluateRunFailure(alive)).toBeUndefined();
    expect(evaluateRunFailure(spent)).toBe('STRESS_DEPLETED');
    expect(evaluateRunFailure(overdrawn)).toBe('STRESS_DEPLETED');
  });
});
