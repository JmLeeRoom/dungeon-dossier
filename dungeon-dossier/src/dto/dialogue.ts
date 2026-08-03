import type { Facet, ProofScope } from '../engine/domain';
import type { PublicDTO } from './public';

export interface RenderableClaim {
  readonly claimId: string;
  readonly canonicalMeaning: string;
  readonly facet: Facet;
}

export interface DialogueRequest {
  readonly allowedClaims: readonly RenderableClaim[];
  readonly reactionKey: string;
  readonly missingScopes: readonly ProofScope[];
  readonly seed: number;
}

export function toRenderableClaims(dto: PublicDTO): readonly RenderableClaim[] {
  return dto.statement.map((claim) => ({
    claimId: claim.claimId,
    canonicalMeaning: claim.text,
    facet: claim.facet,
  }));
}

