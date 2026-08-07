import { describe, expect, it } from 'vitest';

import { detectSuspectTransition } from '../../src/app/suspectTransition';
import { deriveSuspectStatePart } from '../../src/engine/suspectState';

describe('suspect state transition detection', () => {
  it('fires only when the same suspect changes state', () => {
    expect(
      detectSuspectTransition(
        { encounterId: 'enc_a', statePart: 'base' },
        { encounterId: 'enc_a', statePart: 'upset' },
      ),
    ).toEqual({ from: 'base', to: 'upset' });

    expect(
      detectSuspectTransition(
        { encounterId: 'enc_a', statePart: 'upset' },
        { encounterId: 'enc_a', statePart: 'lose' },
      ),
    ).toEqual({ from: 'upset', to: 'lose' });
  });

  it('stays silent on the first mount of an encounter', () => {
    expect(
      detectSuspectTransition(
        { encounterId: undefined, statePart: undefined },
        { encounterId: 'enc_a', statePart: 'base' },
      ),
    ).toBeUndefined();
    expect(
      detectSuspectTransition(
        { encounterId: undefined, statePart: undefined },
        { encounterId: 'enc_a', statePart: 'lose' },
      ),
    ).toBeUndefined();
  });

  it('stays silent when the encounter changed, however the state differs', () => {
    expect(
      detectSuspectTransition(
        { encounterId: 'enc_a', statePart: 'upset' },
        { encounterId: 'enc_b', statePart: 'base' },
      ),
    ).toBeUndefined();
    expect(
      detectSuspectTransition(
        { encounterId: 'enc_a', statePart: 'base' },
        { encounterId: 'enc_b', statePart: 'lose' },
      ),
    ).toBeUndefined();
  });

  it('stays silent on a re-mount that did not change state', () => {
    for (const part of ['base', 'upset', 'lose'] as const) {
      expect(
        detectSuspectTransition(
          { encounterId: 'enc_a', statePart: part },
          { encounterId: 'enc_a', statePart: part },
        ),
        part,
      ).toBeUndefined();
    }
  });

  it('tracks the engine boundary that actually produces the state parts', () => {
    const at = (composure: number, confessed = false): ReturnType<typeof deriveSuspectStatePart> =>
      deriveSuspectStatePart({ composure, composureMax: 100, confessed });

    // ratio <= 0.4 is upset; composure 0 or a confession is lose.
    expect(at(41)).toBe('base');
    expect(at(40)).toBe('upset');
    expect(at(1)).toBe('upset');
    expect(at(0)).toBe('lose');
    expect(at(80, true)).toBe('lose');

    expect(
      detectSuspectTransition(
        { encounterId: 'enc_a', statePart: at(41) },
        { encounterId: 'enc_a', statePart: at(40) },
      ),
    ).toEqual({ from: 'base', to: 'upset' });
    expect(
      detectSuspectTransition(
        { encounterId: 'enc_a', statePart: at(40) },
        { encounterId: 'enc_a', statePart: at(80, true) },
      ),
    ).toEqual({ from: 'upset', to: 'lose' });
  });
});
