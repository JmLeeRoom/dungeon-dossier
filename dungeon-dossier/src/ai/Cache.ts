import { z } from 'zod';
import { DialogueResponseSchema } from './Provider';
import type {
  DialogueKind,
  DialogueProvider,
  DialogueResponse,
  ReactionRequest,
  ReactionResponse,
  StatementRequest,
  StatementResponse,
} from './Provider';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function canonicalDialogueStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/** Stable FNV-1a/64 content key; this is identity, not a security primitive. */
export function hashDialogueContent(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalDialogueStringify(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64-${hash.toString(16).padStart(16, '0')}`;
}

export function createDialogueContentHash(
  kind: DialogueKind,
  request: StatementRequest | ReactionRequest,
  promptVersion: string,
  modelId: string,
): string {
  return hashDialogueContent({ kind, model_id: modelId, prompt_version: promptVersion, request });
}

export interface CachedDialogueEntry {
  readonly kind: DialogueKind;
  readonly content_hash: string;
  readonly prompt_version: string;
  readonly model_id: string;
  readonly response: DialogueResponse;
}

export const CachedDialogueEntrySchema = z.strictObject({
  kind: z.enum(['statement', 'reaction']),
  content_hash: z.string().trim().min(1),
  prompt_version: z.string().trim().min(1),
  model_id: z.string().trim().min(1),
  response: DialogueResponseSchema,
});

/** JSON file contract for injectable content/ai-cache/*.json artifacts. */
export const PreverifiedDialogueCacheFileSchema = z.strictObject({
  schema_version: z.literal('1'),
  entries: z.array(CachedDialogueEntrySchema),
});
export type PreverifiedDialogueCacheFile = z.infer<typeof PreverifiedDialogueCacheFileSchema>;

export interface DialogueCache {
  read(contentHash: string): Promise<CachedDialogueEntry | undefined>;
  write(entry: CachedDialogueEntry): Promise<void>;
}

export class MemoryDialogueCache implements DialogueCache {
  readonly #entries = new Map<string, CachedDialogueEntry>();

  read(contentHash: string): Promise<CachedDialogueEntry | undefined> {
    return Promise.resolve(this.#entries.get(contentHash));
  }

  write(entry: CachedDialogueEntry): Promise<void> {
    this.#entries.set(entry.content_hash, entry);
    return Promise.resolve();
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  entries(): readonly CachedDialogueEntry[] {
    return [...this.#entries.values()];
  }
}

export function createPreverifiedDialogueCacheFile(
  entries: readonly CachedDialogueEntry[],
): PreverifiedDialogueCacheFile {
  return {
    schema_version: '1',
    entries: entries.map((entry) => ({
      ...entry,
      response: {
        ...entry.response,
        tokens: entry.response.tokens.map((token) => ({
          ...token,
          claim_ids: [...token.claim_ids],
        })),
      },
    })),
  };
}

/** Loads already-verified cache artifacts without running OutputValidator again. */
export async function importPreverifiedDialogueCache(
  value: unknown,
  cache: DialogueCache,
): Promise<number> {
  const file = PreverifiedDialogueCacheFileSchema.parse(value);
  for (const entry of file.entries) await cache.write(entry);
  return file.entries.length;
}

export interface CacheIdentity {
  readonly promptVersion: string;
  readonly modelId: string;
}

export class DialogueCacheMissError extends Error {
  readonly contentHash: string;

  constructor(contentHash: string) {
    super(`No pre-verified dialogue cache entry for ${contentHash}.`);
    this.name = 'DialogueCacheMissError';
    this.contentHash = contentHash;
  }
}

/** Provider facade over pre-verified cache entries. Cached output is not revalidated. */
export class CacheProvider implements DialogueProvider {
  readonly #cache: DialogueCache;
  readonly #identity: CacheIdentity;

  constructor(cache: DialogueCache, identity: CacheIdentity) {
    this.#cache = cache;
    this.#identity = identity;
  }

  contentHash(kind: DialogueKind, request: StatementRequest | ReactionRequest): string {
    return createDialogueContentHash(
      kind,
      request,
      this.#identity.promptVersion,
      this.#identity.modelId,
    );
  }

  async renderStatement(request: StatementRequest): Promise<StatementResponse> {
    const entry = await this.#read('statement', request);
    return entry.response;
  }

  async renderReaction(request: ReactionRequest): Promise<ReactionResponse> {
    const entry = await this.#read('reaction', request);
    return entry.response;
  }

  storeStatement(request: StatementRequest, response: StatementResponse): Promise<void> {
    return this.#write('statement', request, response);
  }

  storeReaction(request: ReactionRequest, response: ReactionResponse): Promise<void> {
    return this.#write('reaction', request, response);
  }

  async #read(
    kind: DialogueKind,
    request: StatementRequest | ReactionRequest,
  ): Promise<CachedDialogueEntry> {
    const contentHash = this.contentHash(kind, request);
    const entry = await this.#cache.read(contentHash);
    if (entry === undefined || entry.kind !== kind) throw new DialogueCacheMissError(contentHash);
    return entry;
  }

  #write(
    kind: DialogueKind,
    request: StatementRequest | ReactionRequest,
    response: DialogueResponse,
  ): Promise<void> {
    return this.#cache.write({
      kind,
      content_hash: this.contentHash(kind, request),
      prompt_version: this.#identity.promptVersion,
      model_id: response.model_id,
      response,
    });
  }
}
