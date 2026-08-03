import type { ContentId, Grade, ProofScope } from '../domain';
import type { ClaimKnowledge } from './ClaimState';

export interface EvidenceKnowledge {
  readonly evidenceId: ContentId;
  readonly displayName: string;
  readonly acquired: boolean;
  readonly grade: Grade;
  readonly scopes: readonly ProofScope[];
  readonly notProvenKeys: readonly string[];
}

export interface KnowledgeState {
  readonly claims: readonly ClaimKnowledge[];
  readonly evidence: readonly EvidenceKnowledge[];
}

export function createKnowledgeState(): KnowledgeState {
  return { claims: [], evidence: [] };
}

