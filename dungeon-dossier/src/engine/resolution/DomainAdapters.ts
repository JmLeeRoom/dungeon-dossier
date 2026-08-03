import type {
  BalanceDefinition,
  EvidenceDefinition,
  ProofRule,
  PublicClaim,
  TimeRange as ContentTimeRange,
} from '../domain';
import type {
  IntegrityState,
  ResolutionClaim,
  ResolutionEvidence,
  ResolutionProofRule,
  ResolverBalance,
  TimeRange,
} from './types';

const CLOCK_TIME = /^(?<hour>(?:[01]\d|2[0-3])):(?<minute>[0-5]\d)(?::(?<second>[0-5]\d))?$/u;

function comparableTimePoint(value: ContentTimeRange['from']): number | undefined {
  if (typeof value === 'number') return value;
  const match = CLOCK_TIME.exec(value);
  if (match?.groups === undefined) return undefined;
  return (
    Number(match.groups.hour) * 3_600 +
    Number(match.groups.minute) * 60 +
    Number(match.groups.second ?? 0)
  );
}

/** Converts numeric or HH:MM[:SS] content intervals into deterministic seconds. */
export function toComparableTimeRange(
  range: ContentTimeRange | undefined,
): TimeRange | undefined {
  if (range === undefined) return undefined;
  const from = comparableTimePoint(range.from);
  let to = comparableTimePoint(range.to);
  if (from === undefined || to === undefined) return undefined;
  // A clock interval may intentionally cross midnight.
  if (to < from && typeof range.from === 'string' && typeof range.to === 'string') {
    to += 86_400;
  }
  return {
    from,
    to,
    ...(range.error_seconds === undefined
      ? {}
      : { errorSeconds: range.error_seconds }),
  };
}

export interface RuntimeClaimProjection {
  readonly commitment: ResolutionClaim['commitment'];
  readonly epistemic: ResolutionClaim['epistemic'];
  readonly presentation: ResolutionClaim['presentation'];
}

/** Projects the public Claim contract; the private truth block cannot be passed. */
export function toResolutionClaim(
  claim: PublicClaim,
  state: RuntimeClaimProjection = {
    commitment: claim.initial.commitment,
    epistemic: 'UNKNOWN',
    presentation: claim.initial.presentation,
  },
): ResolutionClaim {
  const timeRange = toComparableTimeRange(claim.time_ref);
  return {
    claimId: claim.claim_id,
    speakerId: claim.speaker,
    facet: claim.facet,
    predicate: claim.predicate,
    canonicalMeaning: claim.canonical_meaning,
    commitment: state.commitment,
    epistemic: state.epistemic,
    presentation: state.presentation,
    ...(claim.subject_id === undefined ? {} : { subjectId: claim.subject_id }),
    ...(claim.object_id === undefined ? {} : { valueId: claim.object_id }),
    ...(claim.facet !== 'WHERE' || claim.object_id === undefined
      ? {}
      : { locationId: claim.object_id }),
    ...(timeRange === undefined ? {} : { timeRange }),
  };
}

function detailNumber(
  detail: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = detail[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return undefined;
}

export interface RuntimeEvidenceProjection {
  readonly grade?: ResolutionEvidence['grade'];
  readonly integrity?: IntegrityState;
}

/** Maps validated content plus mutable evidence state into the pure resolver view. */
export function toResolutionEvidence(
  evidence: EvidenceDefinition,
  state: RuntimeEvidenceProjection = {},
): ResolutionEvidence {
  return {
    evidenceId: evidence.evidence_id,
    grade: state.grade ?? evidence.grade.initial,
    integrity: state.integrity ?? evidence.integrity?.initial ?? 'INTACT',
    independence: {
      sourceId: evidence.independence.source_id,
      group: evidence.independence.group,
      derivedFrom: evidence.independence.derived_from,
    },
    observations: evidence.observations.map((observation) => {
      const timeRange = toComparableTimeRange(observation.time);
      const travelTimeMinSeconds =
        observation.predicate === 'TRAVEL_TIME_MIN'
          ? detailNumber(observation.detail, [
              'travel_min_seconds',
              'minimum_seconds',
              'seconds',
              'value_seconds',
            ])
          : undefined;
      return {
        predicate: observation.predicate,
        scopes: observation.scopes,
        confidence: observation.confidence,
        ...(observation.subject_id === undefined
          ? {}
          : { subjectId: observation.subject_id }),
        ...(observation.object_id === undefined ? {} : { valueId: observation.object_id }),
        ...(observation.location_id === undefined
          ? {}
          : { locationId: observation.location_id }),
        ...(timeRange === undefined ? {} : { timeRange }),
        ...(travelTimeMinSeconds === undefined ? {} : { travelTimeMinSeconds }),
        ...(observation.supports_claim_ids === undefined
          ? {}
          : { supportsClaimIds: observation.supports_claim_ids }),
        ...(observation.contradicts_claim_ids === undefined
          ? {}
          : { contradictsClaimIds: observation.contradicts_claim_ids }),
        ...(observation.eliminates_hypotheses === undefined
          ? {}
          : { eliminatesHypotheses: observation.eliminates_hypotheses }),
      };
    }),
  };
}

export function toResolutionProofRule(rule: ProofRule): ResolutionProofRule {
  return {
    ruleId: rule.rule_id,
    targetClaimId: rule.target_claim_id,
    direction: rule.direction,
    requirements: {
      requiredScopes: rule.requirements.required_scopes,
      minimumConfidence: rule.requirements.minimum_confidence,
      minimumIndependentSources: rule.requirements.minimum_independent_sources,
      ...(rule.requirements.require_integrity === undefined
        ? {}
        : { requireIntegrity: rule.requirements.require_integrity }),
    },
    ...(rule.guaranteed_evidence_sets === undefined
      ? {}
      : { guaranteedEvidenceSets: rule.guaranteed_evidence_sets }),
    ...(rule.known_insufficient_sets === undefined
      ? {}
      : { knownInsufficientSets: rule.known_insufficient_sets }),
    ...(rule.alternate_hypotheses === undefined
      ? {}
      : {
          alternateHypotheses: rule.alternate_hypotheses.map((hypothesis) => ({
            hypothesisId: hypothesis.hypothesis_id,
            disqualifyingEvidenceSets: hypothesis.disqualifying_evidence_sets,
          })),
        }),
    ...(rule.partial_credit === undefined
      ? {}
      : {
          partialCredit: {
            scopesCoveredRatio: rule.partial_credit.scopes_covered_ratio,
            result: rule.partial_credit.result,
          },
        }),
  };
}

export function toResolverBalance(balance: BalanceDefinition): ResolverBalance {
  return {
    directContradictionDamage: balance.dmg.contradict,
    indirectSuspicionDamage: balance.composureDmg.indirect,
    coercion: {
      directContradiction: 0,
      indirectSuspicion: 0,
      insufficient: balance.coercion.insufficient,
      truthAttack: balance.coercion.truthAttack,
      irrelevant: balance.coercion.irrelevant,
    },
    committedMultiplier: balance.committedMultiplier,
    independencePartialWeight: balance.independence.partialWeight,
  };
}
