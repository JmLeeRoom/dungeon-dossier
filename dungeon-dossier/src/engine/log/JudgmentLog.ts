import { canonicalStringify } from './canonicalStringify';

export interface JudgmentLogEntry<TInput = unknown, TResult = unknown> {
  readonly sequence: number;
  readonly input: TInput;
  readonly result: TResult;
}

export type JudgmentLog = readonly JudgmentLogEntry[];

/** Presentation-only generation fields belong in src/ai/GenerationLog. */
export const JUDGMENT_LOG_FORBIDDEN_PRESENTATION_KEYS = [
  'dialogueMode',
  'dialogue_mode',
  'line',
  'full_text',
  'model_id',
  'fallback_used',
  'content_hash',
  'validation_result',
] as const;

function assertEngineOnlyValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertEngineOnlyValue(child, `${path}[${index.toString()}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if ((JUDGMENT_LOG_FORBIDDEN_PRESENTATION_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `JudgmentLog cannot contain AI presentation field ${path}.${key}; use GenerationLog.`,
      );
    }
    assertEngineOnlyValue(child, `${path}.${key}`);
  }
}

export function appendJudgmentLog<TInput, TResult>(
  log: JudgmentLog,
  input: TInput,
  result: TResult,
): JudgmentLog {
  assertEngineOnlyValue(input, 'input');
  assertEngineOnlyValue(result, 'result');
  return [...log, { sequence: log.length, input, result }];
}

export function serializeJudgmentLog(log: JudgmentLog): string {
  return canonicalStringify(log);
}
