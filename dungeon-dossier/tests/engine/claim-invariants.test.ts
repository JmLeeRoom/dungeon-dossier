import { describe, expect, it } from 'vitest';
import {
  assertClaimStateInvariants,
  createInitialClaimKnowledge,
  withCommitmentState,
  withEpistemicState,
  withPresentationState,
} from '../../src/engine/knowledge';

function baseState() {
  return createInitialClaimKnowledge(
    {
      claimId: 'clm_invariant',
      speakerId: 'ent_invariant',
      facet: 'WHO',
      canonicalMeaning: '불변식 검사 진술',
    },
    { commitment: 'ASSERTED', presentation: 'NORMAL', resistance: 1 },
  );
}

describe('claim-state invariants I-1 through I-5', () => {
  it('I-1 requires an unstated claim to be hidden', () => {
    expect(() =>
      assertClaimStateInvariants({ ...baseState(), commitment: 'UNSTATED' }),
    ).toThrow('I-1');

    expect(() =>
      createInitialClaimKnowledge(
        {
          claimId: 'runtime-claim',
          speakerId: 'runtime-speaker',
          facet: 'WHO',
          canonicalMeaning: 'runtime meaning',
        },
        { commitment: 'UNSTATED', presentation: 'NORMAL', resistance: 0 },
      ),
    ).toThrow('I-1');

    expect(() => withCommitmentState(baseState(), 'UNSTATED')).toThrow('I-1');
    expect(() =>
      withPresentationState(
        { ...baseState(), commitment: 'UNSTATED', presentation: 'HIDDEN' },
        'NORMAL',
      ),
    ).toThrow('I-1');
  });

  it('I-2/I-3 preserve deduction axes during presentation changes', () => {
    const original = baseState();
    const changed = withPresentationState(original, 'DISTORTED');
    expect(changed.commitment).toBe(original.commitment);
    expect(changed.epistemic).toBe(original.epistemic);
  });

  it('I-4 rejects a required unresolved claim without another path', () => {
    expect(() =>
      withEpistemicState({ ...baseState(), isRequired: true }, 'UNRESOLVED', {
        hasAlternativePath: false,
      }),
    ).toThrow('I-4');
  });

  it('I-5 rejects copied truth data in knowledge state', () => {
    const leaked = { ...baseState(), truth_relation: 'FALSE' };
    expect(() => assertClaimStateInvariants(leaked)).toThrow('I-5');
  });
});
