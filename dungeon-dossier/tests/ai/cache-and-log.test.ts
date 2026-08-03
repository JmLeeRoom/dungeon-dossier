import { describe, expect, it } from 'vitest';
import {
  CacheProvider,
  MemoryDialogueCache,
  MemoryGenerationLog,
  canonicalDialogueStringify,
  createPreverifiedDialogueCacheFile,
  createDialogueContentHash,
  createGenerationRequestId,
  hashDialogueContent,
  importPreverifiedDialogueCache,
  summarizeGenerationLog,
} from '../../src/ai';
import type { GenerationLogEntry } from '../../src/ai';
import { statementRequest, validStatementResponse, validator } from './helpers';

describe('AI cache identity and reproducibility log', () => {
  it('canonicalizes object key order and reuses identical content hashes', () => {
    expect(canonicalDialogueStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(hashDialogueContent({ a: 1, b: 2 })).toBe(hashDialogueContent({ b: 2, a: 1 }));

    const hash = createDialogueContentHash('statement', statementRequest(), 'prompt-1', 'model-1');
    expect(hash).toBe(
      createDialogueContentHash('statement', statementRequest(), 'prompt-1', 'model-1'),
    );
    expect(createGenerationRequestId(hash)).toBe(createGenerationRequestId(hash));
  });

  it('records immutable copies of every required generation field', () => {
    const log = new MemoryGenerationLog();
    log.record({
      request_id: 'request',
      seed: 7,
      claim_ids: ['claim'],
      prompt_version: 'prompt-1',
      model_id: 'model-1',
      validation_result: 'PASSED',
      fallback_used: false,
      content_hash: 'hash',
      attempts: 1,
      validation_codes: [],
    });
    expect(log.entries()[0]).toEqual({
      request_id: 'request',
      seed: 7,
      claim_ids: ['claim'],
      prompt_version: 'prompt-1',
      model_id: 'model-1',
      validation_result: 'PASSED',
      fallback_used: false,
      content_hash: 'hash',
      attempts: 1,
      validation_codes: [],
    });
  });

  it('flags prompt revision only when live validation failures exceed 10%', () => {
    const passed = (index: number): GenerationLogEntry => ({
      request_id: `request-${index.toString()}`,
      seed: index,
      claim_ids: ['claim'],
      prompt_version: 'prompt-1',
      model_id: 'model-1',
      validation_result: 'PASSED',
      fallback_used: false,
      content_hash: `hash-${index.toString()}`,
      attempts: 1,
      validation_codes: [],
    });
    const tenPercent: GenerationLogEntry[] = Array.from(
      { length: 10 },
      (_, index) => passed(index),
    );
    tenPercent[0] = {
      ...passed(0),
      validation_result: 'FAILED',
      fallback_used: true,
    };
    expect(summarizeGenerationLog(tenPercent)).toMatchObject({
      validation_failure_rate: 0.1,
      prompt_revision_required: false,
    });

    const overLimit = [...tenPercent];
    overLimit[1] = {
      ...passed(1),
      validation_result: 'FAILED',
      fallback_used: true,
    };
    expect(summarizeGenerationLog(overLimit)).toMatchObject({
      validation_failure_rate: 0.2,
      prompt_revision_required: true,
    });

    const withPreverifiedReplays: GenerationLogEntry[] = [
      ...overLimit,
      {
        ...passed(10),
        validation_result: 'CACHE_PREVERIFIED',
        attempts: 0,
      },
      {
        ...passed(11),
        validation_result: 'FALLBACK_PREVERIFIED',
        fallback_used: true,
        attempts: 0,
      },
    ];
    expect(summarizeGenerationLog(withPreverifiedReplays)).toMatchObject({
      total_generations: 12,
      live_validations: 10,
      validation_failure_rate: 0.2,
      prompt_revision_required: true,
    });

    const strictValidator = validator();
    expect(strictValidator.validateStatement({}, statementRequest()).valid).toBe(false);
    summarizeGenerationLog(withPreverifiedReplays);
    expect(strictValidator.validateStatement({}, statementRequest()).valid).toBe(false);
  });

  it('imports and exports the strict preverified content/ai-cache format', async () => {
    const source = new MemoryDialogueCache();
    const sourceProvider = new CacheProvider(source, {
      promptVersion: 'prompt-1', modelId: 'model-1',
    });
    const request = statementRequest();
    await sourceProvider.storeStatement(request, validStatementResponse(request));
    const file = createPreverifiedDialogueCacheFile(source.entries());
    expect(file).toMatchObject({ schema_version: '1', entries: [{ kind: 'statement' }] });

    const target = new MemoryDialogueCache();
    await expect(importPreverifiedDialogueCache(file, target)).resolves.toBe(1);
    const targetProvider = new CacheProvider(target, {
      promptVersion: 'prompt-1', modelId: 'model-1',
    });
    await expect(targetProvider.renderStatement(request)).resolves.toEqual(
      validStatementResponse(request),
    );
    await expect(importPreverifiedDialogueCache({ schema_version: '1', entries: [{}] }, target))
      .rejects.toThrow();
  });
});
