import type { Facet, ProofScope } from '../engine/domain';
import type { EpistemicState, KnowledgeState, PresentationState } from '../engine/knowledge';

export interface StatementTokenView {
  readonly claimId: string;
  readonly speakerId: string;
  readonly facet: Facet;
  readonly text: string;
  readonly epistemic: EpistemicState;
  readonly presentation: PresentationState;
  readonly resistance: number;
}

export interface EvidenceView {
  readonly evidenceId: string;
  readonly displayName: string;
  readonly grade: 'A' | 'B' | 'C';
  readonly scopes: readonly ProofScope[];
  readonly notProvenKeys: readonly string[];
}

export interface ResourceView {
  readonly composure: number;
  readonly coercion: number;
  readonly commandPoints: number;
}

export interface ObjectiveView {
  readonly label: string;
  readonly completed: boolean;
}

export interface PublicDTO {
  readonly statement: readonly StatementTokenView[];
  readonly evidence: readonly EvidenceView[];
  readonly resources: ResourceView;
  readonly objectives: readonly ObjectiveView[];
}

export interface PublicProjectionInput {
  readonly knowledge: KnowledgeState;
  readonly resources: ResourceView;
  readonly objectives: readonly ObjectiveView[];
}

/** Whitelist mapper: every public field is explicitly added here. */
export function toPublicDTO(input: PublicProjectionInput): PublicDTO {
  return {
    statement: input.knowledge.claims
      // I-1 couples UNSTATED with HIDDEN. Check both at the final boundary so
      // even malformed injected knowledge fails closed instead of leaking text.
      .filter(
        (claim) =>
          claim.presentation !== 'HIDDEN' && claim.commitment !== 'UNSTATED',
      )
      .map((claim) => ({
        claimId: claim.claimId,
        speakerId: claim.speakerId,
        facet: claim.facet,
        text: claim.canonicalMeaning,
        epistemic: claim.epistemic,
        presentation: claim.presentation,
        resistance: claim.resistance,
      })),
    evidence: input.knowledge.evidence
      .filter((item) => item.acquired)
      .map((item) => ({
        evidenceId: item.evidenceId,
        displayName: item.displayName,
        grade: item.grade,
        scopes: [...item.scopes],
        notProvenKeys: [...item.notProvenKeys],
      })),
    resources: {
      composure: input.resources.composure,
      coercion: input.resources.coercion,
      commandPoints: input.resources.commandPoints,
    },
    objectives: input.objectives.map((objective) => ({
      label: objective.label,
      completed: objective.completed,
    })),
  };
}

export const PUBLIC_DTO_FORBIDDEN_KEYS = [
  'truth',
  'truthRelation',
  'truth_relation',
  'isLie',
  'is_lie',
  'contradictingEvents',
  'contradicting_events',
  'proofRules',
  'proof_rules',
  'guaranteedEvidenceSets',
  'guaranteed_evidence_sets',
  'knownInsufficientSets',
  'known_insufficient_sets',
  'disqualifyingEvidenceSets',
  'disqualifying_evidence_sets',
  'minimumConfidence',
  'minimum_confidence',
  'minimumIndependentSources',
  'minimum_independent_sources',
  'hypothesis',
  'hypotheses',
] as const;

export function hasForbiddenPublicKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenPublicKey);
  if (value === null || typeof value !== 'object') return false;

  for (const [key, child] of Object.entries(value)) {
    if ((PUBLIC_DTO_FORBIDDEN_KEYS as readonly string[]).includes(key)) return true;
    if (hasForbiddenPublicKey(child)) return true;
  }

  return false;
}
