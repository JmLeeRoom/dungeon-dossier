import { z } from 'zod';

import {
  CommitmentStateSchema,
  ContentIdSchema,
  EpistemicStateSchema,
  PresentationStateSchema,
} from '../vocabulary';

export const NonEmptyStringSchema = z.string().trim().min(1);
export const LocalizationKeySchema = NonEmptyStringSchema.max(240);
export const JsonSchemaReferenceSchema = NonEmptyStringSchema.max(500);
export const VersionSchema = z.string().trim().regex(/^\d+\.\d+(?:\.\d+)?$/);
export const FiniteNumberSchema = z.number().finite();
export const NonNegativeNumberSchema = FiniteNumberSchema.min(0);
export const PositiveIntegerSchema = z.number().int().positive();
export const NonNegativeIntegerSchema = z.number().int().min(0);
export const ProbabilitySchema = FiniteNumberSchema.min(0).max(1);

export const TimePointSchema = z.union([
  FiniteNumberSchema,
  z.string().trim().min(1).max(40),
]);

export const TimeRangeSchema = z
  .strictObject({
    from: TimePointSchema,
    to: TimePointSchema,
    error_seconds: NonNegativeNumberSchema.optional(),
  })
  .superRefine((range, context) => {
    if (
      typeof range.from === 'number' &&
      typeof range.to === 'number' &&
      range.from > range.to
    ) {
      context.addIssue({
        code: 'custom',
        message: 'time.from must be less than or equal to time.to',
        path: ['from'],
      });
    }
  });
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export function uniqueContentIds(minimum = 0) {
  return z
    .array(ContentIdSchema)
    .min(minimum)
    .superRefine((ids, context) => {
      const seen = new Set<string>();
      ids.forEach((id, index) => {
        if (seen.has(id)) {
          context.addIssue({
            code: 'custom',
            message: `duplicate content reference: ${id}`,
            path: [index],
          });
        }
        seen.add(id);
      });
    });
}

/**
 * Conditions stay declarative. Parameter slots are explicit so content cannot
 * smuggle executable expressions into the engine.
 */
export const ConditionTypeSchema = z.enum([
  'ALWAYS',
  'CLAIM_VISIBLE',
  'CLAIM_COMMITMENT',
  'CLAIM_EPISTEMIC',
  'EVIDENCE_OWNED',
  'EVIDENCE_INTACT',
  'ROUTE_USED',
  'RESOURCE_RANGE',
  'PHASE_IS',
  'TURN_RANGE',
  'OBJECTIVE_DONE',
  'FLAG_EQUALS',
  'OUTCOME_IS',
  'ALL_REQUIRED_OBJECTIVES',
  'SOME_REQUIRED_OBJECTIVES',
  'RESOURCE_EXCEEDS',
  'TURN_EXCEEDED',
  'NO_SOLVABLE_PATH',
  'ALL_OF',
  'ANY_OF',
  'NOT',
]);

export const ConditionSchema = z.strictObject({
  type: ConditionTypeSchema,
  claim_id: ContentIdSchema.optional(),
  evidence_id: ContentIdSchema.optional(),
  route_id: ContentIdSchema.optional(),
  node_id: ContentIdSchema.optional(),
  objective_id: ContentIdSchema.optional(),
  flag_id: ContentIdSchema.optional(),
  encounter_id: ContentIdSchema.optional(),
  outcome: NonEmptyStringSchema.optional(),
  resource: NonEmptyStringSchema.optional(),
  commitment: CommitmentStateSchema.optional(),
  epistemic: EpistemicStateSchema.optional(),
  state: z
    .union([
      CommitmentStateSchema,
      EpistemicStateSchema,
      PresentationStateSchema,
    ])
    .optional(),
  value: z.json().optional(),
  min: FiniteNumberSchema.optional(),
  max: FiniteNumberSchema.optional(),
  min_ratio: ProbabilitySchema.optional(),
  conditions: z.array(z.record(z.string(), z.json())).min(1).optional(),
  condition: z.record(z.string(), z.json()).optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const EffectTypeSchema = z.enum([
  'ADJUST_RESOURCE',
  'SET_CLAIM_STATE',
  'REVEAL_CLAIMS',
  'REVISE_CLAIMS',
  'DRAW_CARDS',
  'DISCARD_CARDS',
  'LOCK_CARD',
  'SEAL_EVIDENCE',
  'GRANT_EVIDENCE',
  'UPGRADE_EVIDENCE',
  'ACTIVATE_MODIFIER',
  'DEACTIVATE_MODIFIER',
  'MODIFY_SHIELDS',
  'SET_FLAG',
  'TRIGGER_QTE',
  'OPEN_ROUTE',
  'DISTORT_CLAIM_VIEW',
  'DUPLICATE_CLAIM_VIEW',
  'RESTORE_CLAIM_VIEW',
  'LOCK_CLAIM',
  'LOCK_ACTION',
  'ALTER_ACTION_COST',
  'DAMAGE_EVIDENCE',
  'REMOVE_EVIDENCE',
  'REDUCE_CP',
  'ADD_TIMER',
  'INCREASE_RESISTANCE',
  'DRAW_CARD',
  'DISCARD_CARD',
  'APPLY_STRESS',
  'APPLY_COERCION',
  'CHANGE_PHASE',
  'SPAWN_STATEMENT',
  'UNLOCK_EVIDENCE_SLOT',
]);

export const EffectSchema = z.strictObject({
  type: EffectTypeSchema,
  target: ContentIdSchema.optional(),
  targets: uniqueContentIds().optional(),
  resource: NonEmptyStringSchema.optional(),
  delta: FiniteNumberSchema.optional(),
  value: z.json().optional(),
  duration_turns: PositiveIntegerSchema.optional(),
  parameters: z.record(z.string(), z.json()).optional(),
});
export type Effect = z.infer<typeof EffectSchema>;

export const CostSchema = z
  .strictObject({
    cp: NonNegativeNumberSchema.optional(),
    dp: NonNegativeNumberSchema.optional(),
    stress: NonNegativeNumberSchema.optional(),
    coercion: NonNegativeNumberSchema.optional(),
    trust: NonNegativeNumberSchema.optional(),
  })
  .refine((cost) => Object.keys(cost).length > 0, {
    message: 'a cost must declare at least one resource',
  });
export type Cost = z.infer<typeof CostSchema>;
