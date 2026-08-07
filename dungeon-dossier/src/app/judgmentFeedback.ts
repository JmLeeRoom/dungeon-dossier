import type { JudgmentUiMapDefinition } from '../content-io';
import type { ProofScope, ResolutionCode } from '../engine/domain';
import type {
  JudgmentFeedbackTone,
  JudgmentFeedbackView,
} from '../ui/screens/interrogation';
import { t } from './i18n';

/**
 * The slice of a `Resolution` the banner needs. Narrowing it here keeps the
 * assembler callable from a test without building a full resolution.
 */
export interface JudgmentFeedbackResolution {
  readonly code: ResolutionCode;
  readonly axes: Readonly<{ validity: 'VALID' | 'INVALID' }>;
  readonly feedback?: Readonly<{ missingScopes: readonly ProofScope[] }>;
}

export interface JudgmentFeedbackInput {
  readonly resolution: JudgmentFeedbackResolution;
  /** Canonical meaning of the claim the card was played against. */
  readonly statement?: string;
  readonly evidenceNames?: readonly string[];
  readonly uiMap?: JudgmentUiMapDefinition;
  /** Overrides the code-derived headline, e.g. for a pre-submission preview. */
  readonly headline?: string;
  /** Overrides the code-derived tone. */
  readonly tone?: JudgmentFeedbackTone;
  /** Overrides the derived detail sentence. */
  readonly detail?: string;
}

const CONTRADICTION_CODES: ReadonlySet<ResolutionCode> = new Set([
  'R_DIRECT_CONTRADICTION',
  'R_INDIRECT_SUSPICION',
]);

/**
 * Every code that advanced the interrogation. The evidence table only judges
 * CONFIRM/CONTRADICT, so the action family is classified here by whether its
 * resolution was the success or the failure branch.
 */
const SUPPORT_CODES: ReadonlySet<ResolutionCode> = new Set([
  'R_CONFIRM_LOCKED',
  'R_CONFIRM_PROVISIONAL',
  'R_QUERY_SUCCESS',
  'R_CLARIFY_SUCCESS',
  'R_COMMIT_SUCCESS',
  'R_FORENSIC_REVEALED',
  'R_PRESSURE_APPLIED',
  'R_RECOVER_APPLIED',
  'R_SPECIAL_APPLIED',
]);

export function judgmentFeedbackTone(
  resolution: JudgmentFeedbackResolution,
): JudgmentFeedbackTone {
  if (resolution.axes.validity === 'INVALID') return 'INVALID';
  if (resolution.code === 'R_PROCEDURE_VIOLATION') return 'INVALID';
  if (CONTRADICTION_CODES.has(resolution.code)) return 'CONTRADICTION';
  if (SUPPORT_CODES.has(resolution.code)) return 'SUPPORT';
  return 'MISS';
}

const TONE_HEADLINE_FALLBACK_KEYS: Readonly<Record<JudgmentFeedbackTone, string>> = {
  CONTRADICTION: 'judgment.feedback.contradiction',
  SUPPORT: 'judgment.feedback.support',
  MISS: 'judgment.feedback.miss',
  INVALID: 'judgment.feedback.invalid',
};

/**
 * Only reached for codes the authored map leaves out. The inline text is a
 * last-resort default so the banner never renders a blank detail slot.
 */
const TONE_DETAIL_FALLBACKS: Readonly<
  Record<JudgmentFeedbackTone, Readonly<{ key: string; text: string }>>
> = {
  CONTRADICTION: {
    key: 'judgment.feedback.contradiction_suffix',
    text: '진술이 증거와 어긋났다.',
  },
  SUPPORT: { key: 'judgment.feedback.support_suffix', text: '진술이 증거와 맞물렸다.' },
  MISS: { key: 'judgment.feedback.miss_suffix', text: '이 조합으로는 진술이 흔들리지 않았다.' },
  INVALID: { key: 'judgment.feedback.invalid_suffix', text: '지금 이 조합은 제출할 수 없다.' },
};

const TONE_HEADLINE_FALLBACK_TEXT: Readonly<Record<JudgmentFeedbackTone, string>> = {
  CONTRADICTION: '모순 포착',
  SUPPORT: '진술 확인',
  MISS: '판정 보류',
  INVALID: '무효 행동',
};

function scopeDetail(
  missingScopes: readonly ProofScope[],
  uiMap: JudgmentUiMapDefinition | undefined,
): string | undefined {
  if (uiMap === undefined || missingScopes.length === 0) return undefined;
  const sentences = missingScopes
    .map((scope) => uiMap.proof_scopes[scope]?.missing_feedback_key)
    .filter((key): key is string => key !== undefined)
    .map((key) => t(key))
    .filter((sentence) => sentence.length > 0);
  return sentences.length === 0 ? undefined : sentences.join(' ');
}

function applyFormat(
  format: string,
  values: Readonly<Record<string, string>>,
): string {
  return format.replaceAll(
    /\{(statement|evidence|headline|detail)\}/gu,
    (token, field: string) => values[field] ?? token,
  );
}

/**
 * Turns a completed resolution into the one line the interrogation banner
 * shows. All key lookups happen here so the UI layer never sees a raw key —
 * and so tuning the wording is a `strings.ko.json` edit, not a code change.
 */
export function buildJudgmentFeedback(
  input: JudgmentFeedbackInput,
): JudgmentFeedbackView {
  const tone = input.tone ?? judgmentFeedbackTone(input.resolution);
  const entry = input.uiMap?.resolution_codes[input.resolution.code];
  const headline =
    input.headline ??
    (entry === undefined
      ? t(TONE_HEADLINE_FALLBACK_KEYS[tone], TONE_HEADLINE_FALLBACK_TEXT[tone])
      : t(entry.label_key, TONE_HEADLINE_FALLBACK_TEXT[tone]));

  // A missing-scope list is the most actionable thing the engine produces, so
  // it outranks the generic per-code sentence whenever the resolver emits one.
  const toneDetail = TONE_DETAIL_FALLBACKS[tone];
  const detail =
    input.detail ??
    scopeDetail(input.resolution.feedback?.missingScopes ?? [], input.uiMap) ??
    (entry === undefined
      ? t(toneDetail.key, toneDetail.text)
      : t(entry.feedback_key, toneDetail.text));

  const statementQuote =
    input.statement === undefined || input.statement.trim() === ''
      ? t('judgment.feedback.no_statement', '대상 진술 없음')
      : input.statement;
  const evidenceNames = (input.evidenceNames ?? []).filter((name) => name.trim() !== '');
  const evidenceQuote =
    evidenceNames.length === 0
      ? t('judgment.feedback.no_evidence', '제출 증거 없음')
      : evidenceNames.join('·');

  const format = t(
    'judgment.feedback.format',
    '진술: "{statement}" ↔ 증거: {evidence} [{headline} — {detail}]',
  );
  return {
    tone,
    headline,
    statementQuote,
    evidenceQuote,
    detail,
    text: applyFormat(format, {
      statement: statementQuote,
      evidence: evidenceQuote,
      headline,
      detail,
    }),
  };
}

export interface EvidencePreviewInput {
  readonly requiredScopes: readonly ProofScope[];
  /** Union of the proof scopes carried by the docked evidence. */
  readonly coveredScopes: readonly ProofScope[];
  readonly statement?: string;
  readonly evidenceNames?: readonly string[];
  readonly uiMap?: JudgmentUiMapDefinition;
}

export function missingProofScopes(
  requiredScopes: readonly ProofScope[],
  coveredScopes: readonly ProofScope[],
): readonly ProofScope[] {
  const covered = new Set(coveredScopes);
  return requiredScopes.filter(
    (scope, index) => !covered.has(scope) && requiredScopes.indexOf(scope) === index,
  );
}

/**
 * Pre-submission coverage check. It reuses the post-judgment banner so the
 * player reads the same sentence before and after committing the CP, but it
 * never claims a verdict: the headline says the evidence is under review.
 */
export function buildEvidencePreviewFeedback(
  input: EvidencePreviewInput,
): JudgmentFeedbackView {
  const missingScopes = missingProofScopes(input.requiredScopes, input.coveredScopes);
  const ready = missingScopes.length === 0;
  return buildJudgmentFeedback({
    resolution: {
      code: 'R_INSUFFICIENT_GROUNDS',
      axes: { validity: 'VALID' },
      feedback: { missingScopes },
    },
    tone: ready ? 'SUPPORT' : 'MISS',
    headline: t('judgment.feedback.preview', '증거 검토'),
    ...(ready
      ? { detail: t('judgment.feedback.preview_ready', '필요한 증명 범위를 모두 덮었다.') }
      : {}),
    ...(input.statement === undefined ? {} : { statement: input.statement }),
    ...(input.evidenceNames === undefined ? {} : { evidenceNames: input.evidenceNames }),
    ...(input.uiMap === undefined ? {} : { uiMap: input.uiMap }),
  });
}
