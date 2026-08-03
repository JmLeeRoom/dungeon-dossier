import type {
  DialogueProvider,
  DialogueToken,
  ReactionRequest,
  ReactionResponse,
  StatementRequest,
  StatementResponse,
} from './Provider';

export interface FallbackResponseTemplate {
  readonly full_text: string;
  readonly tokens: readonly DialogueToken[];
}

export interface FallbackCatalog {
  /** Keys are produced by fallbackStatementKey(). */
  readonly statements: Readonly<Record<string, readonly FallbackResponseTemplate[]>>;
  readonly reactions: Readonly<Record<string, readonly FallbackResponseTemplate[]>>;
}

export function fallbackStatementKey(request: StatementRequest): string {
  return request.allowed_claims.map((claim) => claim.claimId).sort().join('|');
}

function selectTemplate(
  templates: readonly FallbackResponseTemplate[] | undefined,
  seed: number,
): Readonly<{ template: FallbackResponseTemplate; index: number }> | null {
  if (templates === undefined || templates.length === 0) return null;
  const index = (seed >>> 0) % templates.length;
  return { template: templates[index] as FallbackResponseTemplate, index };
}

function canonicalEmergency(
  request: StatementRequest | ReactionRequest,
): FallbackResponseTemplate {
  if (request.allowed_claims.length === 0) return { full_text: '…', tokens: [] };

  let fullText = '';
  const tokens: DialogueToken[] = [];
  for (const [index, claim] of request.allowed_claims.entries()) {
    if (fullText.length > 0) fullText += ' ';
    const spanStart = fullText.length;
    fullText += claim.canonicalMeaning;
    tokens.push({
      token_id: `fallback-token-${index.toString()}`,
      claim_ids: [claim.claimId],
      text: claim.canonicalMeaning,
      span_start: spanStart,
      span_end: fullText.length,
    });
  }
  return { full_text: fullText, tokens };
}

function materialize(
  kind: 'statement' | 'reaction',
  request: StatementRequest | ReactionRequest,
  selected: Readonly<{ template: FallbackResponseTemplate; index: number }> | null,
): StatementResponse {
  const template = selected?.template ?? canonicalEmergency(request);
  const index = selected?.index ?? 0;
  return {
    request_id: `fallback-${kind}-${request.seed.toString()}-${index.toString()}`,
    full_text: template.full_text,
    tokens: template.tokens.map((token) => ({
      token_id: token.token_id,
      claim_ids: [...token.claim_ids],
      text: token.text,
      span_start: token.span_start,
      span_end: token.span_end,
    })),
    model_id: 'fallback',
    seed: request.seed,
  };
}

/** Pre-authored fallbacks bypass runtime validation by contract. */
export class FallbackProvider implements DialogueProvider {
  readonly #catalog: FallbackCatalog;

  constructor(catalog: FallbackCatalog) {
    this.#catalog = catalog;
  }

  renderStatement(request: StatementRequest): Promise<StatementResponse> {
    const selected = selectTemplate(
      this.#catalog.statements[fallbackStatementKey(request)],
      request.seed,
    );
    return Promise.resolve(materialize('statement', request, selected));
  }

  renderReaction(request: ReactionRequest): Promise<ReactionResponse> {
    const selected = selectTemplate(this.#catalog.reactions[request.reaction_key], request.seed);
    return Promise.resolve(materialize('reaction', request, selected));
  }
}
