import type {
  InvalidReason,
  ResolutionInput,
  TargetKind,
  Validity,
} from './types';

export interface ValidityResult {
  readonly validity: Validity;
  readonly reason?: InvalidReason;
}

const TARGETS_BY_INTENT = {
  QUERY: ['ROUTE'],
  CLARIFY: ['CLAIM'],
  CONFIRM: ['CLAIM'],
  CONTRADICT: ['CLAIM'],
  RECOVER: ['SELF'],
  PRESSURE: ['CLAIM'],
  FORENSIC: ['EVIDENCE'],
  SPECIAL: ['SPECIAL', 'CLAIM', 'EVIDENCE'],
  COMMIT: ['CLAIM'],
  CROSS_CHECK: [],
} as const satisfies Readonly<Record<ResolutionInput['intent'], readonly TargetKind[]>>;

export function validateActionCompatibility(input: ResolutionInput): ValidityResult {
  if (input.intent === 'CROSS_CHECK') {
    return { validity: 'INVALID', reason: 'RESERVED_INTENT' };
  }

  if (input.actionCompatible === false) {
    return { validity: 'INVALID', reason: 'INCOMPATIBLE_TARGET' };
  }

  const allowedTargets: readonly TargetKind[] = TARGETS_BY_INTENT[input.intent];
  if (!allowedTargets.includes(input.targetKind)) {
    return { validity: 'INVALID', reason: 'INCOMPATIBLE_TARGET' };
  }

  if (input.targetKind === 'CLAIM' && input.target === undefined) {
    return { validity: 'INVALID', reason: 'MISSING_TARGET' };
  }

  if (
    input.intent === 'CONTRADICT' &&
    input.target?.presentation === 'LOCKED'
  ) {
    return { validity: 'INVALID', reason: 'SILENCE' };
  }

  if (input.intent === 'COMMIT' && input.target?.commitment !== 'ASSERTED') {
    return { validity: 'INVALID', reason: 'INCOMPATIBLE_TARGET' };
  }

  if (
    (input.intent === 'CONTRADICT' || input.intent === 'CONFIRM') &&
    input.evidence.length === 0
  ) {
    return { validity: 'INVALID', reason: 'MISSING_EVIDENCE' };
  }

  if (
    (input.intent === 'CONTRADICT' || input.intent === 'CONFIRM') &&
    input.proofRule === undefined
  ) {
    return { validity: 'INVALID', reason: 'MISSING_PROOF_RULE' };
  }

  if (
    (input.intent === 'CONTRADICT' || input.intent === 'CONFIRM') &&
    input.target !== undefined &&
    input.proofRule !== undefined &&
    (input.proofRule.targetClaimId !== input.target.claimId ||
      input.proofRule.direction !==
        (input.intent === 'CONTRADICT' ? 'CONTRADICT' : 'SUPPORT'))
  ) {
    return { validity: 'INVALID', reason: 'INCOMPATIBLE_TARGET' };
  }

  return { validity: 'VALID' };
}

export function validateTargetExposure(input: ResolutionInput): ValidityResult {
  if (!input.targetExposed) {
    return { validity: 'INVALID', reason: 'TARGET_NOT_EXPOSED' };
  }

  return { validity: 'VALID' };
}
