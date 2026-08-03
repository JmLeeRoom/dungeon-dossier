import {
  DialogueProviderError,
  type DialogueProvider,
  type ReactionRequest,
  type ReactionResponse,
  type StatementRequest,
  type StatementResponse,
} from './Provider';

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type DialogueFetch = (
  input: string,
  init: Readonly<{
    method: 'POST';
    headers: Readonly<Record<string, string>>;
    body: string;
  }>,
) => Promise<FetchResponseLike>;

export interface ClaudeApiProviderOptions {
  /** A same-origin dev proxy or local sidecar. Never a browser-held Claude key. */
  readonly endpoint: string;
  readonly fetcher?: DialogueFetch;
}

/** Thin proxy client. Schema and leakage validation remain OutputValidator's job. */
export class ClaudeApiProvider implements DialogueProvider {
  readonly #endpoint: string;
  readonly #fetcher: DialogueFetch;

  constructor(options: ClaudeApiProviderOptions) {
    if (options.endpoint.trim().length === 0) throw new Error('Claude proxy endpoint is required.');
    this.#endpoint = options.endpoint;
    this.#fetcher = options.fetcher ?? fetch.bind(globalThis);
  }

  async renderStatement(request: StatementRequest): Promise<StatementResponse> {
    return this.#post('statement', request) as Promise<StatementResponse>;
  }

  async renderReaction(request: ReactionRequest): Promise<ReactionResponse> {
    return this.#post('reaction', request) as Promise<ReactionResponse>;
  }

  async #post(
    operation: 'statement' | 'reaction',
    request: StatementRequest | ReactionRequest,
  ): Promise<unknown> {
    let response: FetchResponseLike;
    try {
      response = await this.#fetcher(this.#endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, request }),
      });
    } catch (error) {
      throw new DialogueProviderError('Claude proxy request failed.', { cause: error });
    }

    if (!response.ok) {
      throw new DialogueProviderError(
        `Claude proxy returned HTTP ${response.status.toString()}.`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new DialogueProviderError('Claude proxy returned invalid JSON.', { cause: error });
    }
  }
}
