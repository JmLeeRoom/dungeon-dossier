import type { ProofScope } from '../domain';
import type {
  Relation,
  Relevance,
  ResolutionClaim,
  ResolutionEvidence,
  ResolutionProofRule,
  TimeRange,
} from './types';

function orderedUnique<T>(values: readonly T[]): T[] {
  const result: T[] = [];
  for (const value of values) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

export function coveredScopes(evidence: readonly ResolutionEvidence[]): readonly ProofScope[] {
  return orderedUnique(
    evidence.flatMap((item) => item.observations.flatMap((observation) => observation.scopes)),
  );
}

export function evidenceRelevantToRule(
  evidence: ResolutionEvidence,
  rule: ResolutionProofRule,
): boolean {
  return evidence.observations.some((observation) =>
    observation.scopes.some((scope) => rule.requirements.requiredScopes.includes(scope)),
  );
}

export function evaluateRelevance(
  evidence: readonly ResolutionEvidence[],
  rule: ResolutionProofRule,
): Readonly<{
  relevance: Relevance;
  coveredScopes: readonly ProofScope[];
  missingScopes: readonly ProofScope[];
}> {
  const covered = coveredScopes(evidence).filter((scope) =>
    rule.requirements.requiredScopes.includes(scope),
  );
  const missing = rule.requirements.requiredScopes.filter((scope) => !covered.includes(scope));
  const relevance: Relevance =
    covered.length === 0
      ? 'NONE'
      : missing.length === 0
        ? 'FULL'
        : 'PARTIAL';

  return { relevance, coveredScopes: covered, missingScopes: missing };
}

function normalizedRange(range: TimeRange): readonly [number, number] {
  const error = range.errorSeconds ?? 0;
  return [range.from - error, range.to + error];
}

function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  const [leftStart, leftEnd] = normalizedRange(left);
  const [rightStart, rightEnd] = normalizedRange(right);
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function timeConflicts(
  claimTime: TimeRange,
  observationTime: TimeRange,
  travelTimeMinSeconds = 0,
): boolean {
  const [claimStart, claimEnd] = normalizedRange(claimTime);
  const [observationStart, observationEnd] = normalizedRange(observationTime);
  const overlaps = claimStart <= observationEnd && observationStart <= claimEnd;
  if (overlaps) return true;

  const gap =
    claimEnd < observationStart
      ? observationStart - claimEnd
      : claimStart - observationEnd;
  return gap < travelTimeMinSeconds;
}

export function evaluateRelation(
  claim: ResolutionClaim,
  evidence: readonly ResolutionEvidence[],
  relevance: Relevance,
): Relation {
  let supports = false;
  let contradicts = false;
  const submittedTravelTimeMinSeconds = Math.max(
    0,
    ...evidence.flatMap((item) =>
      item.observations.map((observation) => observation.travelTimeMinSeconds ?? 0),
    ),
  );

  for (const item of evidence) {
    for (const observation of item.observations) {
      const explicitlySupports =
        observation.supportsClaimIds?.includes(claim.claimId) === true;
      const explicitlyContradicts =
        observation.contradictsClaimIds?.includes(claim.claimId) === true;
      if (explicitlySupports) supports = true;
      if (explicitlyContradicts) contradicts = true;

      let structurallySupports = false;
      let structurallyContradicts = false;
      const claimTime = claim.timeRange;
      const observationTime = observation.timeRange;
      const comparableTime =
        claimTime !== undefined && observationTime !== undefined;
      const overlapsInTime =
        comparableTime &&
        rangesOverlap(claimTime, observationTime);

      if (
        claim.subjectId !== undefined &&
        observation.subjectId !== undefined &&
        observation.scopes.includes('IDENTITY')
      ) {
        if (claim.subjectId === observation.subjectId) {
          // A matching actor supports a claim only when any supplied temporal
          // context is also applicable. Seeing the same actor at another time
          // is not evidence for the target event.
          if (!comparableTime || overlapsInTime) structurallySupports = true;
        } else {
          structurallyContradicts = true;
        }
      }

      if (
        claim.valueId !== undefined &&
        observation.valueId !== undefined &&
        claim.predicate === observation.predicate
      ) {
        if (claim.valueId === observation.valueId) structurallySupports = true;
        else structurallyContradicts = true;
      }

      if (
        claim.locationId !== undefined &&
        observation.locationId !== undefined &&
        observation.scopes.includes('LOCATION')
      ) {
        if (claim.locationId === observation.locationId) {
          if (!comparableTime || overlapsInTime) structurallySupports = true;
        } else if (
          claim.timeRange !== undefined &&
          observation.timeRange !== undefined &&
          timeConflicts(
            claim.timeRange,
            observation.timeRange,
            Math.max(
              observation.travelTimeMinSeconds ?? 0,
              submittedTravelTimeMinSeconds,
            ),
          )
        ) {
          structurallyContradicts = true;
        }
      }

      if (
        observation.scopes.includes('TIME') &&
        comparableTime &&
        claim.predicate === observation.predicate
      ) {
        // A matching interval can support an otherwise identical structured
        // assertion. A disjoint interval alone is merely unrelated: content
        // must explicitly link claims whose predicates have causal meaning.
        if (overlapsInTime) structurallySupports = true;
      }

      // Within one observation, a structural conflict dominates incidental
      // identity matches. Separate supporting and conflicting observations
      // still produce AMBIGUOUS at the aggregate level.
      if (structurallyContradicts) contradicts = true;
      else if (structurallySupports) supports = true;
    }
  }

  if (supports && contradicts) return 'AMBIGUOUS';
  if (contradicts) return 'CONTRADICTS';
  if (supports) return 'SUPPORTS';
  if (relevance === 'PARTIAL') return 'AMBIGUOUS';
  return 'NEUTRAL';
}
