import { describe, expect, it } from 'vitest';
import type { ClaimDefinition } from '../../src/engine/domain';
import {
  createInitialClaimKnowledge,
  withPresentationState,
} from '../../src/engine/knowledge';
import {
  applyResolutionEffects,
  type OrderedEffect,
} from '../../src/engine/resolution';

describe('engine architecture foundation', () => {
  it('initializes knowledge without copying truth', () => {
    const definition: ClaimDefinition = {
      claimId: 'sample-claim',
      speakerId: 'sample-speaker',
      facet: 'WHO',
      canonicalMeaning: '검증되지 않은 진술',
    };

    const state = createInitialClaimKnowledge(definition, {
      commitment: 'ASSERTED',
      presentation: 'NORMAL',
      resistance: 2,
    });

    expect(state.epistemic).toBe('UNKNOWN');
    expect(Object.hasOwn(state, 'truth')).toBe(false);
  });

  it('changes presentation without changing the other axes', () => {
    const original = createInitialClaimKnowledge(
      {
        claimId: 'sample-claim',
        speakerId: 'sample-speaker',
        facet: 'WHEN',
        canonicalMeaning: '복합 진술',
      },
      { commitment: 'COMMITTED', presentation: 'NORMAL', resistance: 3 },
    );

    const changed = withPresentationState(original, 'DISTORTED');
    expect(changed.commitment).toBe(original.commitment);
    expect(changed.epistemic).toBe(original.epistemic);
    expect(changed.presentation).toBe('DISTORTED');
  });

  it('applies resolution effects in the fixed stage order', () => {
    const effects: readonly OrderedEffect<string>[] = [
      { stage: 'OBJECTIVE_CHECK', payload: 'objective' },
      { stage: 'STATE', payload: 'state' },
      { stage: 'RESOURCES', payload: 'resources' },
      { stage: 'MODIFIERS', payload: 'modifiers' },
      { stage: 'CARD_EFFECTS', payload: 'cards' },
      { stage: 'REVEALS', payload: 'reveals' },
    ];

    const result = applyResolutionEffects<string[], string>([], effects, (state, effect) => [
      ...state,
      effect.payload,
    ]);

    expect(result).toEqual(['resources', 'state', 'reveals', 'cards', 'modifiers', 'objective']);
  });
});

