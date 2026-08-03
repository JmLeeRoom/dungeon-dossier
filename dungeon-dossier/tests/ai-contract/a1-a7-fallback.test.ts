import { describe, expect, it } from 'vitest';
import {
  MemoryGenerationLog,
  OutputValidator,
  SafeDialogueProvider,
  VALIDATION_STAGE_NAMES,
  type StatementResponse,
} from '../../src/ai';
import {
  StubDialogueProvider,
  providerDependencies,
  statementRequest,
  validStatementResponse,
  validator,
} from '../ai/helpers';

const PIPELINE_CONFIG = {
  timeoutMs: 50,
  promptVersion: 'phase5-contract',
  modelId: 'contract-provider',
} as const;

function issueStages(response: StatementResponse, request = statementRequest()): readonly number[] {
  return validator().validateStatement(response, request).issues.map((issue) => issue.stage);
}

describe('AI contract A-1 through A-7', () => {
  it('keeps the seven validation stages present and ordered', () => {
    const result = validator().validateStatement(validStatementResponse(), statementRequest());

    expect(Object.values(VALIDATION_STAGE_NAMES)).toEqual([
      'JSON_SCHEMA',
      'CLAIM_MAPPING',
      'ATOMICITY',
      'SPAN_INTEGRITY',
      'ALLOWED_INFORMATION',
      'FORBIDDEN_EXPRESSIONS',
      'STYLE_CONSISTENCY',
    ]);
    expect(result.valid).toBe(true);
    expect(result.stages.map(({ stage, status }) => [stage, status])).toEqual([
      [1, 'PASS'],
      [2, 'PASS'],
      [3, 'PASS'],
      [4, 'PASS'],
      [5, 'PASS'],
      [6, 'PASS'],
      [7, 'PASS'],
    ]);
  });

  it('A-1 rejects invalid JSON/schema output', () => {
    const result = validator().validateStatement('{invalid-json', statementRequest());

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 1, code: 'INVALID_JSON' })]),
    );
  });

  it('A-2 rejects a claim mapping/seed mismatch', () => {
    const response = validStatementResponse();

    expect(issueStages({ ...response, seed: response.seed + 1 })).toContain(2);
  });

  it('A-3 rejects a compound token without a presentation group', () => {
    const response = validStatementResponse();
    const compound: StatementResponse = {
      ...response,
      tokens: [{
        token_id: 'compound',
        claim_ids: response.tokens.flatMap((token) => token.claim_ids),
        text: response.full_text,
        span_start: 0,
        span_end: response.full_text.length,
      }],
    };

    expect(issueStages(compound)).toContain(3);
  });

  it('A-4 rejects a span that does not match its text', () => {
    const response = validStatementResponse();
    const first = response.tokens[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(issueStages({
      ...response,
      tokens: [{ ...first, text: `${first.text}!` }, ...response.tokens.slice(1)],
    })).toContain(4);
  });

  it('A-5 rejects information explicitly outside the disclosure boundary', () => {
    const request = statementRequest();
    const visiblePhrase = validStatementResponse(request).tokens[0]?.text;
    expect(visiblePhrase).toBeDefined();
    if (visiblePhrase === undefined) return;

    const restricted = { ...request, forbidden_information: [visiblePhrase] };
    expect(issueStages(validStatementResponse(restricted), restricted)).toContain(5);
  });

  it('A-6 rejects an answer-implying or speaker-forbidden expression', () => {
    const request = statementRequest();
    const visiblePhrase = validStatementResponse(request).tokens[1]?.text;
    expect(visiblePhrase).toBeDefined();
    if (visiblePhrase === undefined) return;

    const restricted = {
      ...request,
      speaker_profile: {
        ...request.speaker_profile,
        forbidden_expressions: [visiblePhrase],
      },
    };
    expect(issueStages(validStatementResponse(restricted), restricted)).toContain(6);
  });

  it('A-7 reports sampled style drift as a warning without invalidating output', () => {
    const result = new OutputValidator({
      maxOutOfTokenCharacters: 4,
      styleSampleRate: 1,
      styleConsistencyCheck: () => 'style drift',
    }).validateStatement(validStatementResponse(), statementRequest());

    expect(result.valid).toBe(true);
    expect(result.stages[6]).toMatchObject({ stage: 7, status: 'WARNING' });
  });

  it('retries one forced validation failure, then transitions to fallback', async () => {
    const dependencies = providerDependencies();
    const request = statementRequest();
    const valid = validStatementResponse(request);
    const invalid = { ...valid, seed: valid.seed + 1 };
    const primary = new StubDialogueProvider(() => Promise.resolve(invalid));
    const log = new MemoryGenerationLog();
    const provider = new SafeDialogueProvider({
      primary,
      cache: dependencies.cacheProvider,
      fallback: dependencies.fallback,
      validator: dependencies.validator,
      log,
      config: PIPELINE_CONFIG,
    });

    const response = await provider.renderStatement(request);

    expect(primary.statementCalls).toBe(2);
    expect(response.model_id).toBe('fallback');
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]).toMatchObject({
      attempts: 2,
      fallback_used: true,
      validation_result: 'FAILED',
      validation_codes: ['SEED_MISMATCH', 'SEED_MISMATCH'],
    });
  });
});
