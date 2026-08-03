import { describe, expect, it } from 'vitest';
import { OutputValidator, type StatementRequest, type StatementResponse } from '../../src/ai';
import { statementRequest, validStatementResponse, validator } from './helpers';

function singleRequest(): StatementRequest {
  return {
    ...statementRequest(),
    allowed_claims: [statementRequest().allowed_claims[0] as StatementRequest['allowed_claims'][number]],
  };
}

function singleResponse(text = '22시에'): StatementResponse {
  const request = singleRequest();
  return {
    request_id: 'single',
    full_text: text,
    tokens: [{
      token_id: 'one',
      claim_ids: [request.allowed_claims[0]?.claimId as string],
      text,
      span_start: 0,
      span_end: text.length,
    }],
    model_id: 'test',
    seed: request.seed,
  };
}

function codes(result: ReturnType<OutputValidator['validateStatement']>): readonly string[] {
  return result.issues.map((entry) => entry.code);
}

describe('seven-stage AI output validation', () => {
  it('passes a valid response through all seven stages', () => {
    const result = validator().validateStatement(validStatementResponse(), statementRequest());
    expect(result.valid).toBe(true);
    expect(result.stages.map((stage) => stage.status)).toEqual([
      'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS',
    ]);
  });

  it('stage 1 rejects malformed JSON/schema and skips later stages', () => {
    const result = validator().validateStatement('{not-json', statementRequest());
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('INVALID_JSON');
    expect(result.stages.slice(1).every((stage) => stage.status === 'SKIPPED')).toBe(true);
  });

  it('stage 2 rejects unknown, missing, and duplicate claim mappings', () => {
    const response = validStatementResponse();
    const result = validator().validateStatement({
      ...response,
      tokens: [
        { ...response.tokens[0], claim_ids: ['unknown-claim'] },
        { ...response.tokens[1], claim_ids: ['claim-who', 'claim-who'] },
      ],
    }, statementRequest());
    expect(codes(result)).toEqual(expect.arrayContaining([
      'UNKNOWN_CLAIM', 'MISSING_CLAIM', 'DUPLICATE_CLAIM',
    ]));
  });

  it('stage 3 permits compound tokens only for an explicit presentation group', () => {
    const request = statementRequest();
    const combined: StatementResponse = {
      request_id: 'combined',
      full_text: '22시에 혼자 있었다',
      tokens: [{
        token_id: 'combined-token',
        claim_ids: request.allowed_claims.map((claim) => claim.claimId),
        text: '22시에 혼자 있었다',
        span_start: 0,
        span_end: 11,
      }],
      model_id: 'test',
      seed: request.seed,
    };
    expect(codes(validator().validateStatement(combined, request))).toContain('NON_ATOMIC_TOKEN');

    const grouped = {
      ...request,
      presentation_groups: [{
        group_id: 'compound',
        claim_ids: request.allowed_claims.map((claim) => claim.claimId),
      }],
    };
    expect(validator().validateStatement(combined, grouped).valid).toBe(true);
  });

  it('stage 4 rejects text mismatches and overlapping spans', () => {
    const response = validStatementResponse();
    const result = validator().validateStatement({
      ...response,
      tokens: [
        { ...response.tokens[0], text: '다른 내용' },
        { ...response.tokens[1], span_start: 3 },
      ],
    }, statementRequest());
    expect(codes(result)).toEqual(expect.arrayContaining(['SPAN_TEXT_MISMATCH', 'SPAN_OVERLAP']));
  });

  it('stage 5 rejects outside-case entities, out-of-range times, and excess free text', () => {
    const request = singleRequest();
    const outsideEntity = singleResponse('외부인물은 22시에');
    const wrongTime = singleResponse('23시에');
    const freeText = {
      ...singleResponse(),
      full_text: '긴머리말 22시에',
      tokens: [{ ...singleResponse().tokens[0], span_start: 5, span_end: 9 }],
    };
    expect(codes(validator().validateStatement(outsideEntity, request))).toContain('OUTSIDE_CASE_ENTITY');
    expect(codes(validator().validateStatement(wrongTime, request))).toContain('TIME_OUT_OF_RANGE');
    expect(codes(new OutputValidator({ maxOutOfTokenCharacters: 0 }).validateStatement(freeText, request)))
      .toContain('OUT_OF_TOKEN_LIMIT');
  });

  it('stage 5 rejects phrases listed in forbidden_information', () => {
    const request = {
      ...singleRequest(),
      forbidden_information: ['비밀 정답'],
    };
    expect(codes(validator().validateStatement(singleResponse('비밀 정답 22시에'), request)))
      .toContain('FORBIDDEN_INFORMATION');
  });

  it('stage 6 blocks canonical and speaker-specific answer-implying expressions', () => {
    const request = singleRequest();
    expect(codes(validator().validateStatement(singleResponse('사실은 22시에'), request)))
      .toContain('FORBIDDEN_EXPRESSION');
    expect(codes(validator().validateStatement(singleResponse('수상한 22시에'), request)))
      .toContain('FORBIDDEN_EXPRESSION');
  });

  it('stage 7 is sampled deterministically and warning-only', () => {
    const sampled = new OutputValidator({
      maxOutOfTokenCharacters: 4,
      styleSampleRate: 1,
      styleConsistencyCheck: () => '문체 편차 표본',
    }).validateStatement(validStatementResponse(), statementRequest());
    expect(sampled.valid).toBe(true);
    expect(sampled.stages[6]?.status).toBe('WARNING');
    expect(codes(sampled)).toContain('STYLE_VARIANCE');
  });
});
