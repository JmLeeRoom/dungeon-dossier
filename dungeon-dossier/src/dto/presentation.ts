import type { ResolutionCode as EngineResolutionCode } from '../engine/domain';

/** Re-exported through the DTO boundary so presentation never imports engine modules. */
export type ResolutionCode = EngineResolutionCode;

export const OUTCOME_CODES = [
  'O_FULL_STATEMENT',
  'O_ARREST',
  'O_COERCED_CONFESSION',
  'O_COUNSEL_INTERVENTION',
  'O_OVERWORK',
] as const;
export type OutcomeCode = (typeof OUTCOME_CODES)[number];
