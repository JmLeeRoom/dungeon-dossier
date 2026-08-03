import { describe, expect, it } from 'vitest';
import {
  DialoguePipelineRenderer,
  FallbackProvider,
  MemoryGenerationLog,
  SafeDialogueProvider,
  type StatementResponse,
} from '../../src/ai';
import {
  LEGACY_REQUEST,
  StubDialogueProvider,
  fallbackCatalog,
  providerDependencies,
  requestBuilder,
  statementRequest,
  validStatementResponse,
} from './helpers';

const CONFIG = { timeoutMs: 15, promptVersion: 'prompt-1', modelId: 'claude-test' } as const;

describe('unstoppable dialogue provider chain', () => {
  it('uses a pre-verified cache hit without calling the live provider', async () => {
    const dependencies = providerDependencies();
    const request = statementRequest();
    await dependencies.cacheProvider.storeStatement(request, validStatementResponse(request));
    const primary = new StubDialogueProvider(() => Promise.reject(new Error('must not run')));
    const log = new MemoryGenerationLog();
    const safe = new SafeDialogueProvider({
      primary,
      cache: dependencies.cacheProvider,
      fallback: dependencies.fallback,
      validator: dependencies.validator,
      log,
      config: CONFIG,
    });

    await expect(safe.renderStatement(request)).resolves.toEqual(validStatementResponse(request));
    expect(primary.statementCalls).toBe(0);
    expect(log.entries()[0]).toMatchObject({
      validation_result: 'CACHE_PREVERIFIED', fallback_used: false, attempts: 0,
    });
  });

  it('retries one validation failure once, then caches the valid response', async () => {
    const dependencies = providerDependencies();
    const request = statementRequest();
    const valid = validStatementResponse(request);
    const invalid = {
      ...valid,
      tokens: [{ ...valid.tokens[0], text: '불일치' }, valid.tokens[1]],
    } as StatementResponse;
    const responses = [invalid, valid];
    const primary = new StubDialogueProvider(
      () => Promise.resolve(responses.shift() as StatementResponse),
    );
    const log = new MemoryGenerationLog();
    const safe = new SafeDialogueProvider({
      primary,
      cache: dependencies.cacheProvider,
      fallback: dependencies.fallback,
      validator: dependencies.validator,
      log,
      config: CONFIG,
    });

    await expect(safe.renderStatement(request)).resolves.toEqual(valid);
    expect(primary.statementCalls).toBe(2);
    expect(dependencies.cache.size).toBe(1);
    expect(log.entries()[0]).toMatchObject({
      validation_result: 'PASSED', fallback_used: false, attempts: 2,
    });
    expect(log.entries()[0]?.validation_codes).toContain('SPAN_TEXT_MISMATCH');

    await safe.renderStatement(request);
    expect(primary.statementCalls).toBe(2);
  });

  it('times out twice and returns fallback without stopping the game', async () => {
    const dependencies = providerDependencies();
    const primary = new StubDialogueProvider(() => new Promise<StatementResponse>(() => {}));
    const log = new MemoryGenerationLog();
    const safe = new SafeDialogueProvider({
      primary,
      cache: dependencies.cacheProvider,
      fallback: dependencies.fallback,
      validator: dependencies.validator,
      log,
      config: CONFIG,
    });

    const response = await safe.renderStatement(statementRequest());
    expect(response.model_id).toBe('fallback');
    expect(primary.statementCalls).toBe(2);
    expect(log.entries()[0]).toMatchObject({
      validation_result: 'FAILED', fallback_used: true, attempts: 2,
    });
    expect(log.entries()[0]?.validation_codes).toEqual(['TIMEOUT', 'TIMEOUT']);
  });

  it('does not runtime-revalidate a pre-verified fallback', async () => {
    const dependencies = providerDependencies();
    const request = statementRequest();
    const catalog = fallbackCatalog(request);
    const forbiddenFallback = new FallbackProvider({
      ...catalog,
      statements: {
        [Object.keys(catalog.statements)[0] as string]: [{
          full_text: '사실은 거짓말',
          tokens: validStatementResponse(request).tokens,
        }],
      },
    });
    const invalid = { ...validStatementResponse(request), full_text: '' };
    const primary = new StubDialogueProvider(() => Promise.resolve(invalid));
    const safe = new SafeDialogueProvider({
      primary,
      cache: dependencies.cacheProvider,
      fallback: forbiddenFallback,
      validator: dependencies.validator,
      config: CONFIG,
    });

    await expect(safe.renderStatement(request)).resolves.toMatchObject({
      full_text: '사실은 거짓말', model_id: 'fallback',
    });
    expect(primary.statementCalls).toBe(2);
  });

  it('keeps the existing string DialogueRenderer contract', async () => {
    const dependencies = providerDependencies();
    const safe = new SafeDialogueProvider({
      cache: dependencies.cacheProvider,
      fallback: dependencies.fallback,
      validator: dependencies.validator,
      config: CONFIG,
    });
    const renderer = new DialoguePipelineRenderer(requestBuilder(), safe);
    await expect(renderer.renderStatement(LEGACY_REQUEST)).resolves.toBe('22시에 혼자 있었다');
    await expect(renderer.renderReaction(LEGACY_REQUEST)).resolves.toBe('그게 무슨 증거입니까');
  });
});
