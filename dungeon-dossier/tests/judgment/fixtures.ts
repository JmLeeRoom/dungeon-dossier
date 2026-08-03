import type {
  ResolutionClaim,
  ResolutionEvidence,
  ResolutionInput,
  ResolutionProofRule,
  ResolverBalance,
} from '../../src/engine/resolution';
import type { Grade, ProofScope } from '../../src/engine/domain';

export const TEST_BALANCE: ResolverBalance = {
  directContradictionDamage: 18,
  indirectSuspicionDamage: 5,
  coercion: {
    directContradiction: 1,
    indirectSuspicion: 1,
    insufficient: 2,
    truthAttack: 15,
    irrelevant: 7,
  },
  committedMultiplier: 1.4,
  independencePartialWeight: 0.5,
};

export function claim(
  overrides: Partial<ResolutionClaim> = {},
): ResolutionClaim {
  return {
    claimId: 'clm_qa_target',
    speakerId: 'ent_qa_speaker',
    facet: 'WHERE',
    predicate: 'LOCATED_AT',
    canonicalMeaning: '검증 대상 진술',
    commitment: 'ASSERTED',
    epistemic: 'UNKNOWN',
    presentation: 'NORMAL',
    ...overrides,
  };
}

interface EvidenceOptions {
  readonly grade?: Grade;
  readonly sourceId?: string;
  readonly group?: string;
  readonly derivedFrom?: string | null;
  readonly confidence?: number;
  readonly supports?: boolean;
  readonly contradicts?: boolean;
  readonly integrity?: ResolutionEvidence['integrity'];
}

export function evidence(
  evidenceId: string,
  scopes: readonly ProofScope[],
  options: EvidenceOptions = {},
): ResolutionEvidence {
  return {
    evidenceId,
    grade: options.grade ?? 'A',
    integrity: options.integrity ?? 'INTACT',
    independence: {
      sourceId: options.sourceId ?? evidenceId,
      group: options.group ?? evidenceId,
      derivedFrom: options.derivedFrom ?? null,
    },
    observations: [
      {
        predicate: 'OBSERVATION',
        scopes,
        confidence: options.confidence ?? 0.95,
        ...(options.supports === true ? { supportsClaimIds: ['clm_qa_target'] } : {}),
        ...(options.contradicts === true
          ? { contradictsClaimIds: ['clm_qa_target'] }
          : {}),
      },
    ],
  };
}

interface RuleOptions {
  readonly direction?: ResolutionProofRule['direction'];
  readonly minimumSources?: number;
  readonly minimumConfidence?: number;
  readonly guaranteed?: readonly (readonly string[])[];
  readonly insufficient?: readonly (readonly string[])[];
  readonly partialRatio?: number;
  readonly requireIntegrity?: boolean;
}

export function rule(
  requiredScopes: readonly ProofScope[],
  options: RuleOptions = {},
): ResolutionProofRule {
  return {
    ruleId: 'pr_qa_rule',
    targetClaimId: 'clm_qa_target',
    direction: options.direction ?? 'CONTRADICT',
    requirements: {
      requiredScopes,
      minimumConfidence: options.minimumConfidence ?? 0.9,
      minimumIndependentSources: options.minimumSources ?? 1,
      ...(options.requireIntegrity === undefined
        ? {}
        : { requireIntegrity: options.requireIntegrity }),
    },
    ...(options.guaranteed === undefined
      ? {}
      : { guaranteedEvidenceSets: options.guaranteed }),
    ...(options.insufficient === undefined
      ? {}
      : { knownInsufficientSets: options.insufficient }),
    ...(options.partialRatio === undefined
      ? {}
      : { partialCredit: { scopesCoveredRatio: options.partialRatio, result: 'SUSPECTED' } }),
  };
}

export function input(
  proofRule: ResolutionProofRule,
  submittedEvidence: readonly ResolutionEvidence[],
  overrides: Partial<ResolutionInput> = {},
): ResolutionInput {
  return {
    intent: 'CONTRADICT',
    targetKind: 'CLAIM',
    target: claim(),
    targetExposed: true,
    evidence: submittedEvidence,
    evidenceCatalog: submittedEvidence,
    proofRule,
    procedure: 'FAIR',
    balance: TEST_BALANCE,
    commandPointCost: 1,
    ...overrides,
  };
}

