import { z } from 'zod';

import {
  ActionIntentSchema,
  CommitmentStateSchema,
  ContentIdSchema,
  EpistemicStateSchema,
  PresentationStateSchema,
} from '../vocabulary';
import {
  ConditionSchema,
  EffectTypeSchema,
  FiniteNumberSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  uniqueContentIds,
} from './primitives';

export const EncounterResourcesSchema = z.strictObject({
  composure_max: z.number().positive().finite(),
  cp_per_turn: NonNegativeIntegerSchema,
  cp_max: PositiveIntegerSchema,
  coercion_limit: z.number().positive().finite(),
  shields_per_round: NonNegativeIntegerSchema,
});

export const ClaimShieldSchema = z.strictObject({
  claim_id: ContentIdSchema,
  durability: z.number().positive().finite(),
});

export const EncounterRoundSchema = z.strictObject({
  round_id: ContentIdSchema,
  statement_claims: uniqueContentIds(1),
  shields: z.array(ClaimShieldSchema),
});

export const FlowNodeSchema = z.strictObject({
  node_id: ContentIdSchema,
  enter_conditions: z.array(ConditionSchema),
  reveal_claim_ids: uniqueContentIds(),
  revise_claim_ids: uniqueContentIds(),
  open_route_ids: uniqueContentIds(),
  activate_modifiers: uniqueContentIds(),
  deactivate_modifiers: uniqueContentIds(),
  reaction_key: LocalizationKeySchema,
  resource_delta: z.record(z.string(), FiniteNumberSchema),
  is_terminal: z.boolean(),
});

export const ModifierTriggerSchema = z.enum([
  'ON_ENCOUNTER_START',
  'ON_TURN_START',
  'ON_ACTION_SELECTED',
  'ON_ACTION_SUBMITTED',
  'ON_RESOLUTION',
  'ON_CLAIM_REVEALED',
  'ON_CLAIM_CONFIRMED',
  'ON_DIRECT_CONTRADICTION',
  'ON_COMPOSURE_THRESHOLD',
  'ON_EVIDENCE_USED',
  'ON_TURN_END',
]);

export const ModifierTargetSelectorSchema = z.strictObject({
  scope: NonEmptyStringSchema,
  facet: z.string().optional(),
  ids: uniqueContentIds().optional(),
  exclude_states: z
    .strictObject({
      commitment: z.array(CommitmentStateSchema).optional(),
      epistemic: z.array(EpistemicStateSchema).optional(),
      presentation: z.array(PresentationStateSchema).optional(),
    })
    .optional(),
  count: PositiveIntegerSchema.optional(),
  selection: z
    .enum([
      'DETERMINISTIC_BY_INDEX',
      'HIGHEST_RESISTANCE',
      'MOST_RECENT',
      'SEEDED_RANDOM',
    ])
    .optional(),
});

export const ModifierEffectSchema = z.strictObject({
  type: EffectTypeSchema,
  target_selector: ModifierTargetSelectorSchema.optional(),
  intent: ActionIntentSchema.optional(),
  resource: NonEmptyStringSchema.optional(),
  delta: FiniteNumberSchema.optional(),
  value: z.json().optional(),
  duration_turns: PositiveIntegerSchema.optional(),
  parameters: z.record(z.string(), z.json()).optional(),
});

export const EncounterModifierSchema = z.strictObject({
  modifier_id: ContentIdSchema,
  trigger: ModifierTriggerSchema,
  condition: ConditionSchema.nullable().optional(),
  effect: ModifierEffectSchema,
  counterplay: z.strictObject({
    allowed_intents: z.array(ActionIntentSchema),
    partner_skills: uniqueContentIds(),
    always_available: z.boolean(),
  }),
  activation_limit: NonNegativeIntegerSchema,
  priority: z.number().int(),
});

export const ObjectiveTypeSchema = z.enum([
  'RESOLVE_CLAIM',
  'CONFIRM_CLAIM',
  'REFUTE_CLAIM',
  'REVEAL_CLAIM',
  'CREATE_COMMITMENT',
  'PRESERVE_EVIDENCE',
  'REACH_COMPOSURE_RANGE',
  'KEEP_COERCION_BELOW',
  'SURVIVE_UNTIL_TURN',
  'FINISH_BEFORE_TURN',
  'PROTECT_ENTITY',
  'OPTIONAL_DISCOVERY',
]);

export const ObjectiveSchema = z.strictObject({
  objective_id: ContentIdSchema,
  type: ObjectiveTypeSchema,
  claim_id: ContentIdSchema.optional(),
  evidence_id: ContentIdSchema.optional(),
  entity_id: ContentIdSchema.optional(),
  min: FiniteNumberSchema.optional(),
  max: FiniteNumberSchema.optional(),
  turn: PositiveIntegerSchema.optional(),
});

export const EncounterObjectivesSchema = z.strictObject({
  required: z.array(ObjectiveSchema).min(1),
  optional: z.array(ObjectiveSchema),
  state_conditions: z.strictObject({
    composure_min: NonNegativeNumberSchema,
    composure_max: NonNegativeNumberSchema,
    coercion_max: NonNegativeNumberSchema.optional(),
  }),
});

export const OutcomeGradeSchema = z.enum([
  'BEST_RESOLUTION',
  'PARTIAL_RESOLUTION',
  'COERCED_CONFESSION',
  'FAILED',
]);

export const OutcomeRewardSchema = z.strictObject({
  evidence: uniqueContentIds().optional(),
  cards: uniqueContentIds().optional(),
  relics: uniqueContentIds().optional(),
  dp: NonNegativeNumberSchema.optional(),
  performance: FiniteNumberSchema.optional(),
  flags: z.record(z.string(), z.json()).optional(),
  unlock_causal: ContentIdSchema.optional(),
});

export const OutcomeSchema = z.strictObject({
  outcome_id: ContentIdSchema,
  grade: OutcomeGradeSchema,
  priority: z.number().int(),
  conditions: z.array(ConditionSchema).min(1),
  rewards: OutcomeRewardSchema.optional(),
});

export const EncounterSchema = z.strictObject({
  encounter_id: ContentIdSchema,
  target_entity: ContentIdSchema,
  resources: EncounterResourcesSchema,
  rounds: z.array(EncounterRoundSchema).min(1),
  flow_nodes: z.array(FlowNodeSchema),
  modifiers: z.array(EncounterModifierSchema),
  objectives: EncounterObjectivesSchema,
  outcomes: z.array(OutcomeSchema).min(1),
});
export type EncounterDefinition = z.infer<typeof EncounterSchema>;
