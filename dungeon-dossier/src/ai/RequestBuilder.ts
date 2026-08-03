import type { DialogueRequest } from '../dto';
import type {
  AiRenderableClaim,
  ComposureBand,
  PresentationGroup,
  ReactionRequest,
  SpeakerProfile,
  StatementRequest,
} from './Provider';

export interface RequestBuilderOptions {
  readonly speakerProfile: SpeakerProfile;
  readonly presentationGroups?: readonly PresentationGroup[];
  readonly forbiddenInformation: readonly string[];
  readonly composureBand: ComposureBand;
}

function copySpeakerProfile(profile: SpeakerProfile): SpeakerProfile {
  return {
    race: profile.race,
    personality: [...profile.personality],
    speech: profile.speech,
    forbidden_expressions: [...profile.forbidden_expressions],
  };
}

function copyAllowedClaims(request: DialogueRequest): readonly AiRenderableClaim[] {
  return request.allowedClaims.map((claim) => ({
    claimId: claim.claimId,
    canonicalMeaning: claim.canonicalMeaning,
    facet: claim.facet,
  }));
}

function copyPresentationGroups(
  groups: readonly PresentationGroup[],
  allowedClaimIds: ReadonlySet<string>,
): readonly PresentationGroup[] {
  return groups.map((group) => {
    if (group.claim_ids.length < 2) {
      throw new Error(`Presentation group ${group.group_id} must contain at least two claims.`);
    }
    if (group.claim_ids.some((claimId) => !allowedClaimIds.has(claimId))) {
      throw new Error(`Presentation group ${group.group_id} references a disallowed claim.`);
    }
    return { group_id: group.group_id, claim_ids: [...group.claim_ids] };
  });
}

function normalizeSeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError('Dialogue seed must be a non-negative safe integer.');
  }
  return seed;
}

/** Converts the legacy public DialogueRequest into the strict provider contract. */
export class RequestBuilder {
  readonly #options: RequestBuilderOptions;

  constructor(options: RequestBuilderOptions) {
    this.#options = options;
  }

  buildStatement(request: DialogueRequest): StatementRequest {
    const allowedClaims = copyAllowedClaims(request);
    const allowedClaimIds = new Set(allowedClaims.map((claim) => claim.claimId));
    return {
      speaker_profile: copySpeakerProfile(this.#options.speakerProfile),
      allowed_claims: allowedClaims,
      presentation_groups: copyPresentationGroups(
        this.#options.presentationGroups ?? [],
        allowedClaimIds,
      ),
      forbidden_information: [...this.#options.forbiddenInformation],
      seed: normalizeSeed(request.seed),
    };
  }

  buildReaction(request: DialogueRequest): ReactionRequest {
    return {
      ...this.buildStatement(request),
      reaction_key: request.reactionKey,
      missing_scopes: [...request.missingScopes],
      composure_band: this.#options.composureBand,
    };
  }
}
