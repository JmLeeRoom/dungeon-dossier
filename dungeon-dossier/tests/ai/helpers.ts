import type { DialogueRequest } from '../../src/dto';
import {
  CacheProvider,
  FallbackProvider,
  MemoryDialogueCache,
  OutputValidator,
  RequestBuilder,
  fallbackStatementKey,
  type DialogueProvider,
  type FallbackCatalog,
  type ReactionRequest,
  type ReactionResponse,
  type StatementRequest,
  type StatementResponse,
} from '../../src/ai';

export const LEGACY_REQUEST: DialogueRequest = {
  allowedClaims: [
    { claimId: 'claim-time', canonicalMeaning: '22시에 창고에 있었다', facet: 'WHEN' },
    { claimId: 'claim-who', canonicalMeaning: '혼자 있었다', facet: 'WHO' },
  ],
  reactionKey: 'reaction-insufficient',
  missingScopes: ['IDENTITY'],
  seed: 42,
};

export function requestBuilder(): RequestBuilder {
  return new RequestBuilder({
    speakerProfile: {
      race: 'SLIME',
      personality: ['TIMID'],
      speech: 'POLITE',
      forbidden_expressions: ['수상'],
    },
    presentationGroups: [],
    forbiddenInformation: ['truth_value', 'correct_evidence', 'proof_rules'],
    composureBand: 'MID',
  });
}

export function statementRequest(): StatementRequest {
  return requestBuilder().buildStatement(LEGACY_REQUEST);
}

export function reactionRequest(): ReactionRequest {
  return requestBuilder().buildReaction(LEGACY_REQUEST);
}

export function validStatementResponse(
  request: StatementRequest = statementRequest(),
): StatementResponse {
  return {
    request_id: 'provider-request',
    full_text: '22시에 혼자 있었다',
    tokens: [
      {
        token_id: 'token-time',
        claim_ids: [request.allowed_claims[0]?.claimId ?? 'claim-time'],
        text: '22시에',
        span_start: 0,
        span_end: 4,
      },
      {
        token_id: 'token-who',
        claim_ids: [request.allowed_claims[1]?.claimId ?? 'claim-who'],
        text: '혼자 있었다',
        span_start: 5,
        span_end: 11,
      },
    ],
    model_id: 'claude-test',
    seed: request.seed,
  };
}

export function validator(): OutputValidator {
  return new OutputValidator({
    entityDictionary: { 창고: true, 외부인물: false },
    maxOutOfTokenCharacters: 4,
  });
}

export function fallbackCatalog(request: StatementRequest = statementRequest()): FallbackCatalog {
  return {
    statements: {
      [fallbackStatementKey(request)]: [
        {
          full_text: '22시에 혼자 있었다',
          tokens: validStatementResponse(request).tokens,
        },
      ],
    },
    reactions: {
      'reaction-insufficient': [
        {
          full_text: '그게 무슨 증거입니까',
          tokens: [
            {
              token_id: 'fallback-reaction',
              claim_ids: request.allowed_claims.map((claim) => claim.claimId),
              text: '그게 무슨 증거입니까',
              span_start: 0,
              span_end: 11,
            },
          ],
        },
      ],
    },
  };
}

export function providerDependencies(): Readonly<{
  cache: MemoryDialogueCache;
  cacheProvider: CacheProvider;
  fallback: FallbackProvider;
  validator: OutputValidator;
}> {
  const cache = new MemoryDialogueCache();
  return {
    cache,
    cacheProvider: new CacheProvider(cache, { promptVersion: 'prompt-1', modelId: 'claude-test' }),
    fallback: new FallbackProvider(fallbackCatalog()),
    validator: validator(),
  };
}

export class StubDialogueProvider implements DialogueProvider {
  statementCalls = 0;
  reactionCalls = 0;
  readonly #statement: () => Promise<StatementResponse>;
  readonly #reaction: () => Promise<ReactionResponse>;

  constructor(
    statement: () => Promise<StatementResponse>,
    reaction: () => Promise<ReactionResponse> = statement,
  ) {
    this.#statement = statement;
    this.#reaction = reaction;
  }

  renderStatement(): Promise<StatementResponse> {
    this.statementCalls += 1;
    return this.#statement();
  }

  renderReaction(): Promise<ReactionResponse> {
    this.reactionCalls += 1;
    return this.#reaction();
  }
}
