import type { z } from 'zod';
import {
  DialogueResponseSchema,
  type DialogueResponse,
  type ReactionRequest,
  type StatementRequest,
} from './Provider';

export const VALIDATION_STAGE_NAMES = {
  1: 'JSON_SCHEMA',
  2: 'CLAIM_MAPPING',
  3: 'ATOMICITY',
  4: 'SPAN_INTEGRITY',
  5: 'ALLOWED_INFORMATION',
  6: 'FORBIDDEN_EXPRESSIONS',
  7: 'STYLE_CONSISTENCY',
} as const;

export type ValidationStage = keyof typeof VALIDATION_STAGE_NAMES;
export type ValidationSeverity = 'ERROR' | 'WARNING';
export type ValidationStageStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export interface ValidationIssue {
  readonly stage: ValidationStage;
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
}

export interface ValidationStageResult {
  readonly stage: ValidationStage;
  readonly name: (typeof VALIDATION_STAGE_NAMES)[ValidationStage];
  readonly status: ValidationStageStatus;
  readonly issues: readonly ValidationIssue[];
}

export interface OutputValidationResult {
  readonly valid: boolean;
  readonly response?: DialogueResponse;
  readonly stages: readonly ValidationStageResult[];
  readonly issues: readonly ValidationIssue[];
}

export interface OutputValidationContext {
  /** Entity lexicon: true means this case allows the name, false marks an outside-case name. */
  readonly entityDictionary?: Readonly<Record<string, boolean>>;
  /** Case time dictionary, normalized to 24-hour clock values. */
  readonly allowedTimeHours?: readonly number[];
  readonly maxOutOfTokenCharacters: number;
  readonly answerImplyingExpressions?: readonly string[];
  readonly styleSampleRate?: number;
  readonly styleConsistencyCheck?: (
    response: DialogueResponse,
    request: StatementRequest | ReactionRequest,
  ) => string | readonly string[] | null;
}

const DEFAULT_ANSWER_IMPLYING_EXPRESSIONS = ['거짓말', '사실은'] as const;
const STAGES = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly ValidationStage[];

function issue(
  stage: ValidationStage,
  severity: ValidationSeverity,
  code: string,
  message: string,
): ValidationIssue {
  return { stage, severity, code, message };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value))
  );
}

function normalizedIncludes(text: string, expression: string): boolean {
  return text.toLocaleLowerCase('ko').includes(expression.toLocaleLowerCase('ko'));
}

export function extractHours(text: string): readonly number[] {
  const hours: number[] = [];
  const add = (raw: string | number): void => {
    const hour = Number(raw);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && !hours.includes(hour)) {
      hours.push(hour);
    }
  };

  const withoutMeridiem = text.replace(
    /(오전|오후)\s*(0?\d|1[0-2])\s*시/gu,
    (full, period: string, raw: string) => {
      const hour = Number(raw);
      add(period === '오후' ? (hour % 12) + 12 : hour % 12);
      return ' '.repeat(full.length);
    },
  );

  for (const match of withoutMeridiem.matchAll(/([01]?\d|2[0-3])\s*시/gu)) {
    if (match[1] !== undefined) add(match[1]);
  }
  for (const match of withoutMeridiem.matchAll(/([01]?\d|2[0-3]):[0-5]\d/gu)) {
    if (match[1] !== undefined) add(match[1]);
  }
  return hours;
}

export function countOutOfTokenCharacters(response: DialogueResponse): number {
  const covered = new Uint8Array(response.full_text.length);
  for (const token of response.tokens) {
    const start = Math.max(0, Math.min(response.full_text.length, token.span_start));
    const end = Math.max(start, Math.min(response.full_text.length, token.span_end));
    covered.fill(1, start, end);
  }

  let count = 0;
  for (let index = 0; index < response.full_text.length; index += 1) {
    if (covered[index] === 0 && /\S/u.test(response.full_text[index] as string)) count += 1;
  }
  return count;
}

function schemaIssues(raw: unknown): Readonly<{
  response?: z.infer<typeof DialogueResponseSchema>;
  issues: readonly ValidationIssue[];
}> {
  let candidate = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw) as unknown;
    } catch {
      return {
        issues: [issue(1, 'ERROR', 'INVALID_JSON', 'Provider output is not valid JSON.')],
      };
    }
  }

  const parsed = DialogueResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      issues: [
        issue(
          1,
          'ERROR',
          'SCHEMA_MISMATCH',
          parsed.error.issues.map((entry) => entry.path.join('.') || '<root>').join(', '),
        ),
      ],
    };
  }
  return { response: parsed.data, issues: [] };
}

function mappingIssues(
  response: DialogueResponse,
  request: StatementRequest | ReactionRequest,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowedIds = request.allowed_claims.map((claim) => claim.claimId);
  const mappedIds = response.tokens.flatMap((token) => token.claim_ids);

  for (const claimId of mappedIds) {
    if (!allowedIds.includes(claimId)) {
      issues.push(issue(2, 'ERROR', 'UNKNOWN_CLAIM', `Token maps disallowed claim ${claimId}.`));
    }
  }
  for (const claimId of allowedIds) {
    const mappings = mappedIds.filter((mapped) => mapped === claimId).length;
    if (mappings === 0) {
      issues.push(issue(2, 'ERROR', 'MISSING_CLAIM', `Allowed claim ${claimId} is not mapped.`));
    } else if (mappings > 1) {
      issues.push(issue(2, 'ERROR', 'DUPLICATE_CLAIM', `Allowed claim ${claimId} maps more than once.`));
    }
  }
  if (response.seed !== request.seed) {
    issues.push(issue(2, 'ERROR', 'SEED_MISMATCH', 'Response seed differs from request seed.'));
  }
  return issues;
}

function atomicityIssues(
  response: DialogueResponse,
  request: StatementRequest | ReactionRequest,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const token of response.tokens) {
    if (token.claim_ids.length === 1) continue;
    const allowedGroup = request.presentation_groups.some((group) =>
      sameSet(group.claim_ids, token.claim_ids),
    );
    if (!allowedGroup) {
      issues.push(
        issue(
          3,
          'ERROR',
          'NON_ATOMIC_TOKEN',
          `Token ${token.token_id} combines claims outside presentation_groups.`,
        ),
      );
    }
  }
  return issues;
}

function spanIssues(response: DialogueResponse): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ordered = [...response.tokens].sort(
    (left, right) => left.span_start - right.span_start || left.span_end - right.span_end,
  );
  let previousEnd = 0;

  for (const token of ordered) {
    if (token.span_start >= token.span_end || token.span_end > response.full_text.length) {
      issues.push(
        issue(4, 'ERROR', 'SPAN_BOUNDS', `Token ${token.token_id} has invalid span bounds.`),
      );
      continue;
    }
    if (response.full_text.slice(token.span_start, token.span_end) !== token.text) {
      issues.push(
        issue(4, 'ERROR', 'SPAN_TEXT_MISMATCH', `Token ${token.token_id} text differs from its span.`),
      );
    }
    if (token.span_start < previousEnd) {
      issues.push(issue(4, 'ERROR', 'SPAN_OVERLAP', `Token ${token.token_id} overlaps another token.`));
    }
    previousEnd = Math.max(previousEnd, token.span_end);
  }
  return issues;
}

function allowedInformationIssues(
  response: DialogueResponse,
  request: StatementRequest | ReactionRequest,
  context: OutputValidationContext,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [entity, allowed] of Object.entries(context.entityDictionary ?? {})) {
    if (!allowed && normalizedIncludes(response.full_text, entity)) {
      issues.push(
        issue(5, 'ERROR', 'OUTSIDE_CASE_ENTITY', `Response names outside-case entity ${entity}.`),
      );
    }
  }

  for (const forbidden of request.forbidden_information) {
    if (forbidden.length > 0 && normalizedIncludes(response.full_text, forbidden)) {
      issues.push(
        issue(
          5,
          'ERROR',
          'FORBIDDEN_INFORMATION',
          'Response includes information outside the AI disclosure boundary.',
        ),
      );
    }
  }

  const allowedHours = [
    ...request.allowed_claims.flatMap((claim) =>
      extractHours(claim.canonicalMeaning),
    ),
    ...(context.allowedTimeHours ?? []),
  ];
  for (const hour of extractHours(response.full_text)) {
    if (!allowedHours.includes(hour)) {
      issues.push(
        issue(5, 'ERROR', 'TIME_OUT_OF_RANGE', `Response introduces disallowed hour ${hour.toString()}.`),
      );
    }
  }

  const outsideLength = countOutOfTokenCharacters(response);
  if (outsideLength > context.maxOutOfTokenCharacters) {
    issues.push(
      issue(
        5,
        'ERROR',
        'OUT_OF_TOKEN_LIMIT',
        `Out-of-token text length ${outsideLength.toString()} exceeds the configured cap.`,
      ),
    );
  }
  return issues;
}

function forbiddenExpressionIssues(
  response: DialogueResponse,
  request: StatementRequest | ReactionRequest,
  context: OutputValidationContext,
): readonly ValidationIssue[] {
  const expressions = [
    ...DEFAULT_ANSWER_IMPLYING_EXPRESSIONS,
    ...request.speaker_profile.forbidden_expressions,
    ...(context.answerImplyingExpressions ?? []),
  ].filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);

  return expressions.flatMap((expression) =>
    normalizedIncludes(response.full_text, expression)
      ? [issue(6, 'ERROR', 'FORBIDDEN_EXPRESSION', `Response contains forbidden expression ${expression}.`)]
      : [],
  );
}

function shouldSample(seed: number, rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return (seed % 10_000) / 10_000 < rate;
}

function styleIssues(
  response: DialogueResponse,
  request: StatementRequest | ReactionRequest,
  context: OutputValidationContext,
): readonly ValidationIssue[] {
  const rate = context.styleSampleRate ?? 0;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError('styleSampleRate must be between 0 and 1.');
  }
  if (!shouldSample(request.seed, rate) || context.styleConsistencyCheck === undefined) return [];

  const finding = context.styleConsistencyCheck(response, request);
  const messages = finding === null ? [] : typeof finding === 'string' ? [finding] : finding;
  return messages.map((message) => issue(7, 'WARNING', 'STYLE_VARIANCE', message));
}

function stageResult(
  stage: ValidationStage,
  issues: readonly ValidationIssue[],
  skipped = false,
): ValidationStageResult {
  const status: ValidationStageStatus = skipped
    ? 'SKIPPED'
    : issues.some((entry) => entry.severity === 'ERROR')
      ? 'FAIL'
      : issues.some((entry) => entry.severity === 'WARNING')
        ? 'WARNING'
        : 'PASS';
  return { stage, name: VALIDATION_STAGE_NAMES[stage], status, issues };
}

/** Seven-stage validator. Stage 7 can warn but can never invalidate output. */
export class OutputValidator {
  readonly #context: OutputValidationContext;

  constructor(context: OutputValidationContext) {
    if (
      !Number.isInteger(context.maxOutOfTokenCharacters) ||
      context.maxOutOfTokenCharacters < 0
    ) {
      throw new RangeError('maxOutOfTokenCharacters must be a non-negative integer.');
    }
    if (
      context.allowedTimeHours?.some(
        (hour) => !Number.isInteger(hour) || hour < 0 || hour > 23,
      ) === true
    ) {
      throw new RangeError('allowedTimeHours must contain 24-hour values from 0 to 23.');
    }
    this.#context = context;
  }

  validateStatement(raw: unknown, request: StatementRequest): OutputValidationResult {
    return this.#validate(raw, request);
  }

  validateReaction(raw: unknown, request: ReactionRequest): OutputValidationResult {
    return this.#validate(raw, request);
  }

  #validate(
    raw: unknown,
    request: StatementRequest | ReactionRequest,
  ): OutputValidationResult {
    const schema = schemaIssues(raw);
    if (schema.response === undefined) {
      return {
        valid: false,
        stages: STAGES.map((stage) => stageResult(stage, stage === 1 ? schema.issues : [], stage !== 1)),
        issues: schema.issues,
      };
    }

    const response = schema.response;
    const issuesByStage: Readonly<Record<ValidationStage, readonly ValidationIssue[]>> = {
      1: [],
      2: mappingIssues(response, request),
      3: atomicityIssues(response, request),
      4: spanIssues(response),
      5: allowedInformationIssues(response, request, this.#context),
      6: forbiddenExpressionIssues(response, request, this.#context),
      7: styleIssues(response, request, this.#context),
    };
    const stages = STAGES.map((stage) => stageResult(stage, issuesByStage[stage]));
    const issues = stages.flatMap((stage) => stage.issues);
    return {
      valid: !issues.some((entry) => entry.severity === 'ERROR'),
      response,
      stages,
      issues,
    };
  }
}
