import {
  COMMITMENT_STATES,
  EPISTEMIC_STATES,
  PRESENTATION_STATES,
  type ClaimDefinition,
  type CommitmentState,
  type ContentId,
  type EpistemicState,
  type Facet,
  type PresentationState,
} from '../domain';

// Runtime knowledge uses the domain Zod vocabulary; it never redeclares enums.
export { COMMITMENT_STATES, EPISTEMIC_STATES, PRESENTATION_STATES };
export type { CommitmentState, EpistemicState, PresentationState };

export interface ClaimStateAxes {
  readonly commitment: CommitmentState;
  readonly epistemic: EpistemicState;
  readonly presentation: PresentationState;
}

export interface ClaimKnowledge extends ClaimStateAxes {
  readonly claimId: ContentId;
  readonly speakerId: ContentId;
  readonly facet: Facet;
  readonly canonicalMeaning: string;
  readonly resistance: number;
  readonly isRequired: boolean;
}

export function createInitialClaimKnowledge(
  definition: ClaimDefinition,
  initial: Readonly<{
    commitment: CommitmentState;
    presentation: PresentationState;
    resistance: number;
  }>,
): ClaimKnowledge {
  const state: ClaimKnowledge = {
    claimId: definition.claimId,
    speakerId: definition.speakerId,
    facet: definition.facet,
    canonicalMeaning: definition.canonicalMeaning,
    commitment: initial.commitment,
    epistemic: 'UNKNOWN',
    presentation: initial.presentation,
    resistance: initial.resistance,
    isRequired: definition.isRequired ?? false,
  };
  assertClaimStateInvariants(state);
  return state;
}

/** I-3: presentation gimmicks cannot alter commitment or knowledge. */
export function withPresentationState(
  state: ClaimKnowledge,
  presentation: PresentationState,
): ClaimKnowledge {
  const next = { ...state, presentation };
  assertAxisTransition(state, next, 'PRESENTATION');
  assertClaimStateInvariants(next);
  return next;
}

export function withCommitmentState(
  state: ClaimKnowledge,
  commitment: CommitmentState,
): ClaimKnowledge {
  const next = { ...state, commitment };
  assertAxisTransition(state, next, 'COMMITMENT');
  assertClaimStateInvariants(next);
  return next;
}

export function withEpistemicState(
  state: ClaimKnowledge,
  epistemic: EpistemicState,
  options: Readonly<{ hasAlternativePath?: boolean }> = {},
): ClaimKnowledge {
  const next = { ...state, epistemic };
  assertAxisTransition(state, next, 'EPISTEMIC');
  assertClaimStateInvariants(next, {
    isRequired: next.isRequired,
    ...options,
  });
  return next;
}

export type ClaimStateAxis = 'COMMITMENT' | 'EPISTEMIC' | 'PRESENTATION';

export function assertAxisTransition(
  previous: ClaimStateAxes,
  next: ClaimStateAxes,
  changedAxis: ClaimStateAxis,
): void {
  if (changedAxis !== 'COMMITMENT' && previous.commitment !== next.commitment) {
    throw new Error('I-2 violation: an unrelated transition changed commitment state.');
  }
  if (changedAxis !== 'EPISTEMIC' && previous.epistemic !== next.epistemic) {
    throw new Error('I-2 violation: an unrelated transition changed epistemic state.');
  }
  if (changedAxis === 'PRESENTATION') {
    if (
      previous.commitment !== next.commitment ||
      previous.epistemic !== next.epistemic
    ) {
      throw new Error('I-3 violation: presentation changed a deduction axis.');
    }
  }
}

export function assertClaimStateInvariants(
  state: ClaimStateAxes & Readonly<{ isRequired?: boolean }>,
  options: Readonly<{ isRequired?: boolean; hasAlternativePath?: boolean }> = {},
): void {
  if (state.commitment === 'UNSTATED' && state.presentation !== 'HIDDEN') {
    throw new Error('I-1 violation: an unstated claim must be hidden.');
  }

  if (
    state.epistemic === 'UNRESOLVED' &&
    (state.isRequired ?? options.isRequired) === true &&
    options.hasAlternativePath !== true
  ) {
    throw new Error('I-4 violation: a required unresolved claim needs an alternate path.');
  }

  const record = state as unknown as Record<string, unknown>;
  if (
    Object.hasOwn(record, 'truth') ||
    Object.hasOwn(record, 'truthRelation') ||
    Object.hasOwn(record, 'truth_relation')
  ) {
    throw new Error('I-5 violation: truth cannot be copied into knowledge state.');
  }
}
