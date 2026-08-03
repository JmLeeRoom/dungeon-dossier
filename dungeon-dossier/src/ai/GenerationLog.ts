export type GenerationValidationResult =
  | 'PASSED'
  | 'FAILED'
  | 'CACHE_PREVERIFIED'
  | 'FALLBACK_PREVERIFIED';

export const MAX_VALIDATION_FAILURE_RATE = 0.1;

/** Required reproducibility fields, plus bounded attempt diagnostics. */
export interface GenerationLogEntry {
  readonly request_id: string;
  readonly seed: number;
  readonly claim_ids: readonly string[];
  readonly prompt_version: string;
  readonly model_id: string;
  readonly validation_result: GenerationValidationResult;
  readonly fallback_used: boolean;
  readonly content_hash: string;
  readonly attempts: number;
  readonly validation_codes: readonly string[];
}

export interface GenerationLogSink {
  record(entry: GenerationLogEntry): void;
}

export interface GenerationLogSummary {
  readonly total_generations: number;
  readonly live_validations: number;
  readonly validation_failures: number;
  readonly fallback_generations: number;
  readonly validation_failure_rate: number;
  readonly prompt_revision_required: boolean;
}

/**
 * Cache/fallback-only replays are excluded from the validator denominator.
 * A rate above 10% requests prompt revision; it never relaxes validation.
 */
export function summarizeGenerationLog(
  entries: readonly GenerationLogEntry[],
): GenerationLogSummary {
  const live = entries.filter((entry) =>
    entry.validation_result === 'PASSED' || entry.validation_result === 'FAILED',
  );
  const failures = live.filter((entry) => entry.validation_result === 'FAILED').length;
  const failureRate = live.length === 0 ? 0 : failures / live.length;
  return {
    total_generations: entries.length,
    live_validations: live.length,
    validation_failures: failures,
    fallback_generations: entries.filter((entry) => entry.fallback_used).length,
    validation_failure_rate: failureRate,
    prompt_revision_required: failureRate > MAX_VALIDATION_FAILURE_RATE,
  };
}

export class MemoryGenerationLog implements GenerationLogSink {
  readonly #entries: GenerationLogEntry[] = [];

  record(entry: GenerationLogEntry): void {
    this.#entries.push({
      ...entry,
      claim_ids: [...entry.claim_ids],
      validation_codes: [...entry.validation_codes],
    });
  }

  entries(): readonly GenerationLogEntry[] {
    return this.#entries.map((entry) => ({
      ...entry,
      claim_ids: [...entry.claim_ids],
      validation_codes: [...entry.validation_codes],
    }));
  }

  summary(): GenerationLogSummary {
    return summarizeGenerationLog(this.#entries);
  }

  clear(): void {
    this.#entries.length = 0;
  }
}

export function createGenerationRequestId(contentHash: string): string {
  const safe = contentHash.replace(/[^a-z0-9-]/giu, '').slice(0, 32);
  return `req-${safe}`;
}
