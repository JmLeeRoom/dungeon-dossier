import {
  RESOLUTION_CODES,
  type ActionIntent,
  type ContentId,
  type Effect,
  type Facet,
  type Grade,
  type ProofScope,
  type ResolutionCode,
} from '../domain';
import type { CommitmentState, EpistemicState, PresentationState } from '../knowledge';

export { RESOLUTION_CODES };
export type { ResolutionCode };

export const VALIDITIES = ['VALID', 'INVALID'] as const;
export type Validity = (typeof VALIDITIES)[number];

export const RELEVANCES = ['NONE', 'PARTIAL', 'FULL'] as const;
export type Relevance = (typeof RELEVANCES)[number];

export const RELATIONS = ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL', 'AMBIGUOUS'] as const;
export type Relation = (typeof RELATIONS)[number];

export const SUFFICIENCIES = ['INSUFFICIENT', 'PROVISIONAL', 'SUFFICIENT'] as const;
export type Sufficiency = (typeof SUFFICIENCIES)[number];

export const INDEPENDENCE_RESULTS = ['MET', 'UNMET'] as const;
export type Independence = (typeof INDEPENDENCE_RESULTS)[number];

export const PROCEDURES = ['FAIR', 'COERCIVE', 'FORBIDDEN'] as const;
export type Procedure = (typeof PROCEDURES)[number];

export const HYPOTHESIS_RESULTS = ['NOT_APPLICABLE', 'CLEARED', 'REMAINING'] as const;
export type HypothesisResult = (typeof HYPOTHESIS_RESULTS)[number];

import type { InvalidReason } from '../domain/vocabulary';

export type { InvalidReason };

export type TargetKind = 'CLAIM' | 'ROUTE' | 'EVIDENCE' | 'SELF' | 'SPECIAL';

export interface TimeRange {
  readonly from: number;
  readonly to: number;
  readonly errorSeconds?: number;
}

export interface ResolutionClaim {
  readonly claimId: ContentId;
  readonly speakerId: ContentId;
  readonly facet: Facet;
  readonly predicate: string;
  readonly canonicalMeaning: string;
  readonly commitment: CommitmentState;
  readonly epistemic: EpistemicState;
  readonly presentation: PresentationState;
  readonly subjectId?: ContentId;
  readonly locationId?: ContentId;
  readonly valueId?: ContentId;
  readonly timeRange?: TimeRange;
}

export interface ResolutionObservation {
  readonly predicate: string;
  readonly scopes: readonly ProofScope[];
  readonly confidence: number;
  readonly subjectId?: ContentId;
  readonly locationId?: ContentId;
  readonly valueId?: ContentId;
  readonly timeRange?: TimeRange;
  readonly travelTimeMinSeconds?: number;
  readonly supportsClaimIds?: readonly ContentId[];
  readonly contradictsClaimIds?: readonly ContentId[];
  readonly eliminatesHypotheses?: readonly string[];
}

export type IntegrityState = 'INTACT' | 'DEGRADED' | 'DISPUTED' | 'DESTROYED';

export interface ResolutionEvidence {
  readonly evidenceId: ContentId;
  readonly grade: Grade;
  readonly integrity: IntegrityState;
  readonly independence: Readonly<{
    sourceId: string;
    group: string;
    derivedFrom: ContentId | null;
  }>;
  readonly observations: readonly ResolutionObservation[];
}

export interface ResolutionProofRule {
  readonly ruleId: ContentId;
  readonly targetClaimId: ContentId;
  readonly direction: 'SUPPORT' | 'CONTRADICT';
  readonly requirements: Readonly<{
    requiredScopes: readonly ProofScope[];
    minimumConfidence: number;
    minimumIndependentSources: number;
    requireIntegrity?: boolean;
    eliminateHypotheses?: readonly string[];
  }>;
  readonly guaranteedEvidenceSets?: readonly (readonly ContentId[])[];
  readonly knownInsufficientSets?: readonly (readonly ContentId[])[];
  readonly alternateHypotheses?: readonly Readonly<{
    hypothesisId: ContentId;
    disqualifyingEvidenceSets: readonly (readonly ContentId[])[];
  }>[];
  readonly partialCredit?: Readonly<{
    scopesCoveredRatio: number;
    result: 'SUSPECTED';
  }>;
}

export interface ResolverBalance {
  readonly directContradictionDamage: number;
  readonly indirectSuspicionDamage: number;
  readonly coercion: Readonly<{
    directContradiction: number;
    indirectSuspicion: number;
    insufficient: number;
    truthAttack: number;
    irrelevant: number;
  }>;
  readonly committedMultiplier: number;
  readonly independencePartialWeight: number;
}

export interface ActionContext {
  readonly routeAvailable?: boolean;
  readonly clarifiable?: boolean;
  readonly resistanceExceeded?: boolean;
  readonly pressureBackfire?: boolean;
  readonly reveals?: readonly ContentId[];
  readonly cardEffects?: readonly Effect[];
  readonly modifierEffects?: readonly Effect[];
  readonly composureDelta?: number;
  readonly coercionDelta?: number;
  readonly commitmentState?: CommitmentState;
  readonly presentationState?: PresentationState;
}

export interface ResolutionInput {
  readonly intent: ActionIntent;
  readonly targetKind: TargetKind;
  readonly target?: ResolutionClaim;
  readonly targetExposed: boolean;
  readonly actionCompatible?: boolean;
  readonly evidence: readonly ResolutionEvidence[];
  readonly evidenceCatalog?: readonly ResolutionEvidence[];
  readonly proofRule?: ResolutionProofRule;
  readonly procedure: Procedure;
  readonly balance: ResolverBalance;
  readonly commandPointCost: number;
  readonly actionContext?: ActionContext;
}

export const RESOLUTION_STEPS = [
  'ACTION_COMPATIBILITY',
  'TARGET_EXPOSURE',
  'RELEVANCE',
  'RELATION',
  'SCOPE_COVERAGE',
  'CONFIDENCE',
  'INDEPENDENCE',
  'ALTERNATIVE_HYPOTHESES',
  'PROCEDURE',
  'LOOKUP',
] as const;
export type ResolutionStep = (typeof RESOLUTION_STEPS)[number];

export interface ResolutionAxes {
  readonly validity: Validity;
  readonly relevance?: Relevance;
  readonly relation?: Relation;
  readonly sufficiency?: Sufficiency;
  readonly independence?: Independence;
  readonly hypotheses?: HypothesisResult;
  readonly procedure: Procedure;
}

export interface ResolutionFeedback {
  readonly coveredScopes: readonly ProofScope[];
  readonly missingScopes: readonly ProofScope[];
}

export interface ResolutionEffects {
  readonly composureDelta: number;
  readonly coercionDelta: number;
  readonly epistemicState?: EpistemicState;
  readonly commitmentState?: CommitmentState;
  readonly presentationState?: PresentationState;
  readonly resistanceDelta: number;
  readonly reveals: readonly ContentId[];
  readonly cardEffects: readonly Effect[];
  readonly modifierEffects: readonly Effect[];
  readonly checkObjectives: boolean;
  readonly consumeCommandPoints: boolean;
  readonly commandPointDelta: number;
  readonly phaseTransitionWeight: number;
  readonly terminalOutcome?: 'FAILED';
}

export interface Resolution {
  readonly code: ResolutionCode;
  readonly reason?: InvalidReason;
  readonly axes: ResolutionAxes;
  readonly feedback?: ResolutionFeedback;
  readonly effects: ResolutionEffects;
  readonly reveals: readonly ContentId[];
  readonly reactionKey: string;
  readonly trace: readonly ResolutionStep[];
}
