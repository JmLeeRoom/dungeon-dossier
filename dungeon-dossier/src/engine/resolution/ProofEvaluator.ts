import type { ProofScope } from '../domain';
import { approxGte } from './approxGte';
import { evaluateRelevance } from './EvidenceRelationEvaluator';
import type {
  HypothesisResult,
  ResolutionEvidence,
  ResolutionProofRule,
  Sufficiency,
} from './types';

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function includesSet(submitted: readonly string[], required: readonly string[]): boolean {
  return required.every((value) => submitted.includes(value));
}

function contributingEvidence(
  evidence: readonly ResolutionEvidence[],
  requiredScopes: readonly ProofScope[],
): readonly ResolutionEvidence[] {
  return evidence.filter((item) =>
    item.observations.some((observation) =>
      observation.scopes.some((scope) => requiredScopes.includes(scope)),
    ),
  );
}

export function evaluateConfidence(
  evidence: readonly ResolutionEvidence[],
  rule: ResolutionProofRule,
): Readonly<{ met: boolean; minimumObserved: number }> {
  const confidences = evidence.flatMap((item) =>
    item.observations
      .filter((observation) =>
        observation.scopes.some((scope) => rule.requirements.requiredScopes.includes(scope)),
      )
      .map((observation) => observation.confidence),
  );
  const minimumObserved = confidences.length === 0 ? 0 : Math.min(...confidences);
  return {
    met: approxGte(minimumObserved, rule.requirements.minimumConfidence),
    minimumObserved,
  };
}

export function evaluateHypotheses(
  evidence: readonly ResolutionEvidence[],
  rule: ResolutionProofRule,
): HypothesisResult {
  const required = [
    ...(rule.requirements.eliminateHypotheses ?? []),
    ...(rule.alternateHypotheses ?? []).map((hypothesis) => hypothesis.hypothesisId),
  ].filter((hypothesis, index, all) => all.indexOf(hypothesis) === index);
  if (required.length === 0) return 'NOT_APPLICABLE';

  const eliminated: string[] = [];
  for (const item of evidence) {
    for (const observation of item.observations) {
      for (const hypothesis of observation.eliminatesHypotheses ?? []) {
        if (!eliminated.includes(hypothesis)) eliminated.push(hypothesis);
      }
    }
  }

  const submittedIds = evidence.map((item) => item.evidenceId);
  for (const hypothesis of rule.alternateHypotheses ?? []) {
    if (
      hypothesis.disqualifyingEvidenceSets.some((set) =>
        set.every((evidenceId) => submittedIds.includes(evidenceId)),
      ) &&
      !eliminated.includes(hypothesis.hypothesisId)
    ) {
      eliminated.push(hypothesis.hypothesisId);
    }
  }

  return required.every((hypothesis) => eliminated.includes(hypothesis))
    ? 'CLEARED'
    : 'REMAINING';
}

export function evaluateProof(
  evidence: readonly ResolutionEvidence[],
  rule: ResolutionProofRule,
  confidenceMet: boolean,
): Readonly<{
  sufficiency: Sufficiency;
  path: 'GUARANTEED' | 'KNOWN_INSUFFICIENT' | 'SEMANTIC' | 'PARTIAL' | 'NONE';
}> {
  const submittedIds = evidence.map((item) => item.evidenceId);
  const relevant = contributingEvidence(evidence, rule.requirements.requiredScopes);
  const semanticIntegrityMet =
    rule.requirements.requireIntegrity !== true ||
    relevant.every((item) => item.integrity === 'INTACT');
  const semanticCGradeOnly =
    relevant.length > 0 && relevant.every((item) => item.grade === 'C');

  for (const guaranteed of rule.guaranteedEvidenceSets ?? []) {
    if (!includesSet(submittedIds, guaranteed)) continue;
    const guaranteedEvidence = guaranteed.flatMap((evidenceId) => {
      const matched = evidence.find((item) => item.evidenceId === evidenceId);
      return matched === undefined ? [] : [matched];
    });
    const guaranteedIntegrityMet =
      rule.requirements.requireIntegrity !== true ||
      guaranteedEvidence.every((item) => item.integrity === 'INTACT');
    if (guaranteedIntegrityMet) {
      const guaranteedCGradeOnly =
        guaranteedEvidence.length > 0 &&
        guaranteedEvidence.every((item) => item.grade === 'C');
      return {
        sufficiency: guaranteedCGradeOnly ? 'PROVISIONAL' : 'SUFFICIENT',
        path: 'GUARANTEED',
      };
    }
  }

  for (const insufficient of rule.knownInsufficientSets ?? []) {
    if (sameSet(submittedIds, insufficient)) {
      return { sufficiency: 'INSUFFICIENT', path: 'KNOWN_INSUFFICIENT' };
    }
  }

  const coverage = evaluateRelevance(evidence, rule);
  if (
    coverage.relevance === 'FULL' &&
    confidenceMet &&
    semanticIntegrityMet
  ) {
    return {
      sufficiency: semanticCGradeOnly ? 'PROVISIONAL' : 'SUFFICIENT',
      path: 'SEMANTIC',
    };
  }

  const requiredCount = rule.requirements.requiredScopes.length;
  const coveredCount = coverage.coveredScopes.length;
  const ratio = requiredCount === 0 ? 1 : coveredCount / requiredCount;
  if (
    rule.partialCredit !== undefined &&
    approxGte(ratio, rule.partialCredit.scopesCoveredRatio)
  ) {
    return { sufficiency: 'PROVISIONAL', path: 'PARTIAL' };
  }

  return { sufficiency: 'INSUFFICIENT', path: 'NONE' };
}

/**
 * Checks one objective's candidate rules. The caller supplies both currently
 * owned and still-obtainable evidence, then repeats this check per required
 * objective before deciding NO_SOLVABLE_PATH.
 */
export function hasSolvableProofPath(
  rules: readonly ResolutionProofRule[],
  availableOrObtainableEvidence: readonly ResolutionEvidence[],
): boolean {
  return rules.some((rule) =>
    (rule.guaranteedEvidenceSets ?? []).some((guaranteedSet) =>
      guaranteedSet.every((evidenceId) =>
        availableOrObtainableEvidence.some(
          (item) => item.evidenceId === evidenceId && item.integrity === 'INTACT',
        ),
      ),
    ),
  );
}
