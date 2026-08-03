import type { DialogueRequest } from '../dto';
import { DialogueCacheMissError, type CacheProvider } from './Cache';
import type { DialogueRenderer } from './DialogueRenderer';
import type { FallbackProvider } from './FallbackProvider';
import {
  createGenerationRequestId,
  type GenerationLogSink,
  type GenerationValidationResult,
} from './GenerationLog';
import type { OutputValidationResult, OutputValidator } from './OutputValidator';
import {
  DialogueTimeoutError,
  type DialogueKind,
  type DialogueProvider,
  type DialogueResponse,
  type ReactionRequest,
  type ReactionResponse,
  type StatementRequest,
  type StatementResponse,
} from './Provider';
import type { RequestBuilder } from './RequestBuilder';

export interface DialoguePipelineConfig {
  /** Draft tuning value. It is required configuration, never a buried literal. */
  readonly timeoutMs: number;
  readonly promptVersion: string;
  readonly modelId: string;
}

export interface SafeDialogueProviderOptions {
  readonly primary?: DialogueProvider | null;
  readonly cache: CacheProvider;
  readonly fallback: FallbackProvider;
  readonly validator: OutputValidator;
  readonly log?: GenerationLogSink;
  readonly config: DialoguePipelineConfig;
}

function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new DialogueTimeoutError(timeoutMs)), timeoutMs);
    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error) {
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    void pending.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

interface RenderOperations {
  readonly kind: DialogueKind;
  readonly request: StatementRequest | ReactionRequest;
  readonly readCache: () => Promise<DialogueResponse>;
  readonly callPrimary: () => Promise<DialogueResponse>;
  readonly writeCache: (response: DialogueResponse) => Promise<void>;
  readonly useFallback: () => Promise<DialogueResponse>;
  readonly validate: (response: unknown) => OutputValidationResult;
}

/** Cache fast-path → primary (one retry) → pre-verified fallback. Never rejects for AI failure. */
export class SafeDialogueProvider implements DialogueProvider {
  readonly #primary: DialogueProvider | null;
  readonly #cache: CacheProvider;
  readonly #fallback: FallbackProvider;
  readonly #validator: OutputValidator;
  readonly #log: GenerationLogSink | undefined;
  readonly #config: DialoguePipelineConfig;

  constructor(options: SafeDialogueProviderOptions) {
    if (!Number.isFinite(options.config.timeoutMs) || options.config.timeoutMs <= 0) {
      throw new RangeError('AI timeoutMs must be a finite positive number.');
    }
    if (options.config.promptVersion.length === 0 || options.config.modelId.length === 0) {
      throw new Error('AI promptVersion and modelId are required.');
    }
    this.#primary = options.primary ?? null;
    this.#cache = options.cache;
    this.#fallback = options.fallback;
    this.#validator = options.validator;
    this.#log = options.log;
    this.#config = options.config;
  }

  async renderStatement(request: StatementRequest): Promise<StatementResponse> {
    const response = await this.#render({
      kind: 'statement',
      request,
      readCache: () => this.#cache.renderStatement(request),
      callPrimary: () => {
        if (this.#primary === null) return Promise.reject(new Error('AI_OFF'));
        return this.#primary.renderStatement(request);
      },
      writeCache: (value) => this.#cache.storeStatement(request, value),
      useFallback: () => this.#fallback.renderStatement(request),
      validate: (value) => this.#validator.validateStatement(value, request),
    });
    return response;
  }

  async renderReaction(request: ReactionRequest): Promise<ReactionResponse> {
    const response = await this.#render({
      kind: 'reaction',
      request,
      readCache: () => this.#cache.renderReaction(request),
      callPrimary: () => {
        if (this.#primary === null) return Promise.reject(new Error('AI_OFF'));
        return this.#primary.renderReaction(request);
      },
      writeCache: (value) => this.#cache.storeReaction(request, value),
      useFallback: () => this.#fallback.renderReaction(request),
      validate: (value) => this.#validator.validateReaction(value, request),
    });
    return response;
  }

  async #render(operations: RenderOperations): Promise<DialogueResponse> {
    const contentHash = this.#cache.contentHash(operations.kind, operations.request);
    const requestId = createGenerationRequestId(contentHash);
    const claimIds = operations.request.allowed_claims.map((claim) => claim.claimId);
    const validationCodes: string[] = [];

    try {
      const cached = await operations.readCache();
      this.#record({
        requestId,
        request: operations.request,
        claimIds,
        contentHash,
        response: cached,
        validationResult: 'CACHE_PREVERIFIED',
        fallbackUsed: false,
        attempts: 0,
        validationCodes,
      });
      return cached;
    } catch (error) {
      if (!(error instanceof DialogueCacheMissError)) validationCodes.push('CACHE_READ_FAILED');
    }

    let attempts = 0;
    if (this.#primary !== null) {
      // Exactly two total attempts: initial request plus one retry.
      while (attempts < 2) {
        attempts += 1;
        try {
          const candidate = await withTimeout(operations.callPrimary, this.#config.timeoutMs);
          const validation = operations.validate(candidate);
          if (validation.valid && validation.response !== undefined) {
            try {
              await operations.writeCache(validation.response);
            } catch {
              validationCodes.push('CACHE_WRITE_FAILED');
            }
            validationCodes.push(
              ...validation.issues
                .filter((entry) => entry.severity === 'WARNING')
                .map((entry) => entry.code),
            );
            this.#record({
              requestId,
              request: operations.request,
              claimIds,
              contentHash,
              response: validation.response,
              validationResult: 'PASSED',
              fallbackUsed: false,
              attempts,
              validationCodes,
            });
            return validation.response;
          }
          validationCodes.push(...validation.issues.map((entry) => entry.code));
        } catch (error) {
          validationCodes.push(error instanceof DialogueTimeoutError ? 'TIMEOUT' : 'PROVIDER_ERROR');
        }
      }
    }

    // Fallback content is pre-verified and intentionally bypasses OutputValidator.
    const fallback = await operations.useFallback();
    const validationResult: GenerationValidationResult = attempts > 0
      ? 'FAILED'
      : 'FALLBACK_PREVERIFIED';
    this.#record({
      requestId,
      request: operations.request,
      claimIds,
      contentHash,
      response: fallback,
      validationResult,
      fallbackUsed: true,
      attempts,
      validationCodes,
    });
    return fallback;
  }

  #record(input: Readonly<{
    requestId: string;
    request: StatementRequest | ReactionRequest;
    claimIds: readonly string[];
    contentHash: string;
    response: DialogueResponse;
    validationResult: GenerationValidationResult;
    fallbackUsed: boolean;
    attempts: number;
    validationCodes: readonly string[];
  }>): void {
    this.#log?.record({
      request_id: input.requestId,
      seed: input.request.seed,
      claim_ids: [...input.claimIds],
      prompt_version: this.#config.promptVersion,
      model_id: input.response.model_id,
      validation_result: input.validationResult,
      fallback_used: input.fallbackUsed,
      content_hash: input.contentHash,
      attempts: input.attempts,
      validation_codes: [...input.validationCodes],
    });
  }
}

/** Legacy string adapter: existing game callers keep the DialogueRenderer API unchanged. */
export class DialoguePipelineRenderer implements DialogueRenderer {
  readonly #requestBuilder: RequestBuilder;
  readonly #provider: DialogueProvider;

  constructor(requestBuilder: RequestBuilder, provider: DialogueProvider) {
    this.#requestBuilder = requestBuilder;
    this.#provider = provider;
  }

  async renderStatement(request: DialogueRequest): Promise<string> {
    const response = await this.#provider.renderStatement(
      this.#requestBuilder.buildStatement(request),
    );
    return response.full_text;
  }

  async renderReaction(request: DialogueRequest): Promise<string> {
    const response = await this.#provider.renderReaction(
      this.#requestBuilder.buildReaction(request),
    );
    return response.full_text;
  }
}
