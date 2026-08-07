import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { clearStrings, installStrings } from '../../src/app/i18n';
import {
  buildEvidencePreviewFeedback,
  buildJudgmentFeedback,
  judgmentFeedbackTone,
  missingProofScopes,
  type JudgmentFeedbackResolution,
} from '../../src/app/judgmentFeedback';
import {
  JudgmentUiMapSchema,
  StringsSchema,
  type JudgmentUiMapDefinition,
} from '../../src/content-io';
import { RESOLUTION_CODES, type ResolutionCode } from '../../src/engine/resolution';

const RAW_KEY_PATTERN = /(?:^|\s)[a-z0-9_]+\.[a-z0-9_.]+(?:\s|$)/u;

let uiMap: JudgmentUiMapDefinition;
let strings: Readonly<Record<string, string>>;

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

function resolution(
  code: ResolutionCode,
  overrides: Partial<JudgmentFeedbackResolution> = {},
): JudgmentFeedbackResolution {
  return {
    code,
    axes: { validity: 'VALID' },
    ...overrides,
  };
}

beforeAll(async () => {
  uiMap = JudgmentUiMapSchema.parse(await content('common/judgment-ui-map.json'));
  strings = StringsSchema.parse(await content('common/strings.ko.json')).strings;
});

afterEach(() => {
  clearStrings();
});

describe('judgment tone mapping', () => {
  it('classifies invalidity ahead of the resolution code', () => {
    expect(
      judgmentFeedbackTone(
        resolution('R_DIRECT_CONTRADICTION', { axes: { validity: 'INVALID' } }),
      ),
    ).toBe('INVALID');
    expect(judgmentFeedbackTone(resolution('R_ACTION_INVALID', {
      axes: { validity: 'INVALID' },
    }))).toBe('INVALID');
    expect(judgmentFeedbackTone(resolution('R_PROCEDURE_VIOLATION'))).toBe('INVALID');
  });

  it('separates contradictions, supports, and misses', () => {
    expect(judgmentFeedbackTone(resolution('R_DIRECT_CONTRADICTION'))).toBe('CONTRADICTION');
    expect(judgmentFeedbackTone(resolution('R_INDIRECT_SUSPICION'))).toBe('CONTRADICTION');
    expect(judgmentFeedbackTone(resolution('R_CONFIRM_LOCKED'))).toBe('SUPPORT');
    expect(judgmentFeedbackTone(resolution('R_CONFIRM_PROVISIONAL'))).toBe('SUPPORT');
    expect(judgmentFeedbackTone(resolution('R_INSUFFICIENT_GROUNDS'))).toBe('MISS');
    expect(judgmentFeedbackTone(resolution('R_IRRELEVANT_EVIDENCE'))).toBe('MISS');
    expect(judgmentFeedbackTone(resolution('R_TRUTH_ATTACKED'))).toBe('MISS');
    // A blocked or refused action family play is a miss, not a success.
    expect(judgmentFeedbackTone(resolution('R_QUERY_SUCCESS'))).toBe('SUPPORT');
    expect(judgmentFeedbackTone(resolution('R_QUERY_BLOCKED'))).toBe('MISS');
    expect(judgmentFeedbackTone(resolution('R_PRESSURE_APPLIED'))).toBe('SUPPORT');
    expect(judgmentFeedbackTone(resolution('R_PRESSURE_BACKFIRE'))).toBe('MISS');
  });

  it('assigns a tone to every resolution code the engine can emit', () => {
    for (const code of RESOLUTION_CODES) {
      expect(judgmentFeedbackTone(resolution(code)), code).toBeTruthy();
    }
  });
});

describe('judgment feedback assembly', () => {
  it('quotes the statement against the evidence with the authored headline', () => {
    installStrings(strings);
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_DIRECT_CONTRADICTION'),
      statement: '동쪽 공터에 있었다',
      evidenceNames: ['서쪽 창고 열쇠'],
      uiMap,
    });

    expect(feedback.tone).toBe('CONTRADICTION');
    expect(feedback.headline).toBe('직접 모순');
    expect(feedback.statementQuote).toBe('동쪽 공터에 있었다');
    expect(feedback.evidenceQuote).toBe('서쪽 창고 열쇠');
    expect(feedback.detail).toBe('증거가 진술을 정면으로 무너뜨렸다.');
    expect(feedback.text).toContain('동쪽 공터에 있었다');
    expect(feedback.text).toContain('서쪽 창고 열쇠');
    expect(feedback.text).toContain('직접 모순');
  });

  it('prefers the missing-scope sentences over the generic code feedback', () => {
    installStrings(strings);
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_INSUFFICIENT_GROUNDS', {
        feedback: { missingScopes: ['LOCATION', 'TIME'] },
      }),
      statement: '동쪽 공터에 있었다',
      evidenceNames: ['출입 기록'],
      uiMap,
    });

    expect(feedback.tone).toBe('MISS');
    expect(feedback.detail).toBe(
      '위치를 증명할 증거가 더 필요하다. 시각을 특정할 증거가 더 필요하다.',
    );
    expect(feedback.detail).not.toBe(strings['judgment.insufficient.feedback']);
  });

  it('falls back to the code feedback when no scope is missing', () => {
    installStrings(strings);
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_IRRELEVANT_EVIDENCE', { feedback: { missingScopes: [] } }),
      statement: '동쪽 공터에 있었다',
      evidenceNames: ['빈 커피잔'],
      uiMap,
    });

    expect(feedback.detail).toBe('제출한 증거는 이 진술과 아무 관련이 없다.');
  });

  it('labels an empty submission instead of leaving the slot blank', () => {
    installStrings(strings);
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_RECOVER_APPLIED'),
      uiMap,
    });

    expect(feedback.evidenceQuote).toBe('제출 증거 없음');
    expect(feedback.statementQuote).toBe('대상 진술 없음');
    expect(feedback.headline).toBe('진술 확인');
    expect(feedback.detail).toBe('진술이 증거와 맞물렸다.');
  });

  it('joins multiple evidence names into one quote', () => {
    installStrings(strings);
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_CONFIRM_LOCKED'),
      statement: '문은 잠겨 있었다',
      evidenceNames: ['출입 기록', '열쇠 대장'],
      uiMap,
    });

    expect(feedback.evidenceQuote).toBe('출입 기록·열쇠 대장');
  });

  it('accepts a caller-supplied headline for the pre-submission preview', () => {
    installStrings(strings);
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_INSUFFICIENT_GROUNDS', {
        feedback: { missingScopes: ['MOTIVE'] },
      }),
      statement: '아무 것도 몰랐다',
      evidenceNames: [],
      headline: strings['judgment.feedback.preview'] ?? '증거 검토',
      uiMap,
    });

    expect(feedback.headline).toBe('증거 검토');
    expect(feedback.detail).toBe('동기를 설명할 증거가 더 필요하다.');
  });

  it('never renders a raw dotted key, for any code, with or without the map', () => {
    installStrings(strings);
    for (const code of RESOLUTION_CODES) {
      for (const map of [uiMap, undefined]) {
        const feedback = buildJudgmentFeedback({
          resolution: resolution(code),
          statement: '진술',
          evidenceNames: ['증거'],
          ...(map === undefined ? {} : { uiMap: map }),
        });
        expect(feedback.headline, code).not.toMatch(RAW_KEY_PATTERN);
        expect(feedback.detail, code).not.toMatch(RAW_KEY_PATTERN);
        expect(feedback.text, code).not.toMatch(RAW_KEY_PATTERN);
        expect(feedback.headline.length, code).toBeGreaterThan(0);
        expect(feedback.detail.length, code).toBeGreaterThan(0);
      }
    }
  });

  it('still produces readable copy when the string table was never installed', () => {
    const feedback = buildJudgmentFeedback({
      resolution: resolution('R_TRUTH_ATTACKED'),
      statement: '진술',
      evidenceNames: ['증거'],
    });

    expect(feedback.tone).toBe('MISS');
    expect(feedback.headline).toBe('판정 보류');
    expect(feedback.detail).toBe('이 조합으로는 진술이 흔들리지 않았다.');
    expect(feedback.text).not.toMatch(RAW_KEY_PATTERN);
  });

  it('covers every string key the assembler can reach', () => {
    const required = [
      'judgment.feedback.format',
      'judgment.feedback.no_evidence',
      'judgment.feedback.no_statement',
      'judgment.feedback.contradiction',
      'judgment.feedback.contradiction_suffix',
      'judgment.feedback.support',
      'judgment.feedback.support_suffix',
      'judgment.feedback.miss',
      'judgment.feedback.miss_suffix',
      'judgment.feedback.invalid',
      'judgment.feedback.invalid_suffix',
      'judgment.feedback.preview',
      'judgment.feedback.preview_ready',
    ];
    expect(required.filter((key) => strings[key] === undefined)).toEqual([]);
  });
});

describe('pre-submission evidence preview', () => {
  it('subtracts covered scopes from required ones without duplicates', () => {
    expect(missingProofScopes(['TIME', 'LOCATION', 'TIME'], ['LOCATION'])).toEqual(['TIME']);
    expect(missingProofScopes(['TIME'], ['TIME', 'LOCATION'])).toEqual([]);
    expect(missingProofScopes([], ['TIME'])).toEqual([]);
  });

  it('warns about the gaps the docked evidence has not covered yet', () => {
    installStrings(strings);
    const preview = buildEvidencePreviewFeedback({
      requiredScopes: ['LOCATION', 'TIME'],
      coveredScopes: ['LOCATION'],
      statement: '동쪽 공터에 있었다',
      evidenceNames: ['출입 기록'],
      uiMap,
    });

    expect(preview.tone).toBe('MISS');
    expect(preview.headline).toBe('증거 검토');
    expect(preview.detail).toBe('시각을 특정할 증거가 더 필요하다.');
    expect(preview.text).toContain('출입 기록');
  });

  it('reads as ready, not as a verdict, once every scope is covered', () => {
    installStrings(strings);
    const preview = buildEvidencePreviewFeedback({
      requiredScopes: ['LOCATION'],
      coveredScopes: ['LOCATION', 'TIME'],
      statement: '동쪽 공터에 있었다',
      evidenceNames: ['출입 기록', '열쇠 대장'],
      uiMap,
    });

    expect(preview.tone).toBe('SUPPORT');
    expect(preview.headline).toBe('증거 검토');
    expect(preview.detail).toBe('필요한 증명 범위를 모두 덮었다.');
    // The preview must never borrow a judgment label from the ui map.
    expect(preview.headline).not.toBe(strings['judgment.insufficient.label']);
    expect(preview.text).not.toMatch(RAW_KEY_PATTERN);
  });
});
