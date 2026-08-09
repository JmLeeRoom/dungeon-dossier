import { describe, expect, it } from 'vitest';

import { interrogationV2TurnLoopEnabled } from '../../src/app/featureFlags';

describe('interrogationV2TurnLoop release gate', () => {
  it('ships the combined P0-3/P0-4 gate in production', () => {
    expect(interrogationV2TurnLoopEnabled('', false)).toBe(true);
    expect(interrogationV2TurnLoopEnabled('?v2turnloop=0', false)).toBe(true);
  });

  it('is on by default with a DEV-only emergency comparison switch', () => {
    expect(interrogationV2TurnLoopEnabled('', true)).toBe(true);
    expect(interrogationV2TurnLoopEnabled('?other=1', true)).toBe(true);
    expect(interrogationV2TurnLoopEnabled('?v2turnloop=false', true)).toBe(false);
    expect(interrogationV2TurnLoopEnabled('?v2turnloop=0', true)).toBe(false);
  });

  it('activates for explicit DEV opt-in values', () => {
    expect(interrogationV2TurnLoopEnabled('?v2turnloop=1', true)).toBe(true);
    expect(interrogationV2TurnLoopEnabled('?v2turnloop=true', true)).toBe(true);
  });
});
