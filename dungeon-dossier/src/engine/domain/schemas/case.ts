import { z } from 'zod';

import {
  ActionIntentSchema,
  CommitmentStateSchema,
  ContentIdSchema,
  FacetSchema,
} from '../vocabulary';
import { PublicClaimSchema, TruthClaimSchema } from './claim';
import { DialogueSchema } from './dialogue';
import { EncounterSchema } from './encounter';
import { EvidenceSchema } from './evidence';
import { FlagDefinitionSchema } from './flags';
import {
  ConditionSchema,
  CostSchema,
  EffectSchema,
  JsonSchemaReferenceSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  ProbabilitySchema,
  TimeRangeSchema,
  VersionSchema,
  uniqueContentIds,
} from './primitives';
import { ProofRuleSchema } from './proofRule';

export const EntityTypeSchema = z.enum([
  'PERSON',
  'LOCATION',
  'OBJECT',
  'ORGANIZATION',
  'RECORD_SYSTEM',
]);

export const EntityRoleSchema = z.enum([
  'SUSPECT',
  'WITNESS',
  'VICTIM',
  'BYSTANDER',
  'SCENE',
  'INSTRUMENT',
  'NONE',
]);

export const EntitySchema = z.strictObject({
  entity_id: ContentIdSchema,
  type: EntityTypeSchema,
  role: EntityRoleSchema,
  display_name_key: LocalizationKeySchema,
  attributes: z.record(z.string(), z.json()),
});
export type EntityDefinition = z.infer<typeof EntitySchema>;

export const EventSchema = z.strictObject({
  event_id: ContentIdSchema,
  time: TimeRangeSchema,
  location_id: ContentIdSchema.optional(),
  participants: uniqueContentIds(1),
  action: NonEmptyStringSchema,
  objects: uniqueContentIds().optional(),
  caused_by: ContentIdSchema.optional(),
  instructed_by: ContentIdSchema.optional(),
});
export type EventDefinition = z.infer<typeof EventSchema>;

export const InquiryRouteSchema = z
  .strictObject({
    route_id: ContentIdSchema,
    target_slot: ContentIdSchema,
    slot_label_key: LocalizationKeySchema,
    facet: FacetSchema,
    allowed_intents: z.array(ActionIntentSchema).min(1),
    preconditions: z.array(ConditionSchema),
    reveals: uniqueContentIds(),
    unlocks_routes: uniqueContentIds(),
    creates_commitment: z.boolean(),
    commitment_level: CommitmentStateSchema.optional(),
    coercion_risk: NonNegativeNumberSchema,
    composure_delta: z.number().finite(),
    single_use: z.boolean(),
  })
  .superRefine((route, context) => {
    if (
      route.reveals.length === 0 &&
      route.unlocks_routes.length === 0 &&
      !route.creates_commitment
    ) {
      context.addIssue({
        code: 'custom',
        message: 'an inquiry route must change information state',
      });
    }
    if (route.creates_commitment && route.commitment_level === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'creates_commitment requires commitment_level',
        path: ['commitment_level'],
      });
    }
  });
export type InquiryRouteDefinition = z.infer<typeof InquiryRouteSchema>;

const NonCombatBaseShape = {
  event_id: ContentIdSchema,
  node: ContentIdSchema,
  title_key: LocalizationKeySchema,
  description_key: LocalizationKeySchema,
};

export const ChoiceEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('A'),
  choices: z
    .array(
      z.strictObject({
        choice_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        costs: CostSchema.optional(),
        gains: z.array(EffectSchema),
        sets_flags: z.record(z.string(), z.json()),
      }),
    )
    .min(2),
});

export const PlacementEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('B'),
  items: z
    .array(
      z.strictObject({
        item_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
      }),
    )
    .min(1),
  slots: z
    .array(
      z.strictObject({
        slot_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
      }),
    )
    .min(1),
  answer_mapping: z.record(ContentIdSchema, ContentIdSchema),
  partial_scoring: z.strictObject({
    points_per_correct: z.number().positive().finite(),
    success_ratio: ProbabilitySchema,
    partial_ratio: ProbabilitySchema,
  }),
});

export const InvestigationEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('C'),
  spots: z
    .array(
      z.strictObject({
        spot_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        effects: z.array(EffectSchema).min(1),
      }),
    )
    .min(1),
  attempt_limit: z.number().int().positive(),
  per_attempt_costs: CostSchema,
});

export const NonCombatEventSchema = z.discriminatedUnion('pattern', [
  ChoiceEventSchema,
  PlacementEventSchema,
  InvestigationEventSchema,
]);
export type NonCombatEventDefinition = z.infer<typeof NonCombatEventSchema>;

export const CaseMetadataSchema = z.strictObject({
  title: NonEmptyStringSchema,
  title_key: LocalizationKeySchema.optional(),
  /** Runtime registry key selected by content, e.g. 배경/심문실/시안. */
  background_asset_key: NonEmptyStringSchema.optional(),
  act: NonNegativeIntegerSchema,
  difficulty: z.number().int().positive().optional(),
  tags: z.array(NonEmptyStringSchema).optional(),
  estimated_turns: z.number().int().positive(),
  author: NonEmptyStringSchema.optional(),
  content_version: VersionSchema.optional(),
  validated_at: z.string().date().optional(),
});

const CaseCommonShape = {
  $schema: JsonSchemaReferenceSchema.optional(),
  schema_version: VersionSchema,
  case_id: ContentIdSchema,
  metadata: CaseMetadataSchema,
  entities: z.array(EntitySchema).min(1),
  events: z.array(EventSchema).min(1),
  inquiry_routes: z.array(InquiryRouteSchema),
  evidence: z.array(EvidenceSchema),
  proof_rules: z.array(ProofRuleSchema),
  encounters: z.array(EncounterSchema).min(1),
  events_noncombat: z.array(NonCombatEventSchema),
  flag_hooks: z.array(FlagDefinitionSchema),
  dialogue: DialogueSchema,
};

/** Raw case file schema. Its claims are TruthGraph-owned records. */
export const CaseSchema = z.strictObject({
  ...CaseCommonShape,
  claims: z.array(TruthClaimSchema).min(1),
});
export type CaseDefinition = z.infer<typeof CaseSchema>;

/** Sanitized case view suitable for systems that must never receive truth. */
export const PublicCaseSchema = z.strictObject({
  ...CaseCommonShape,
  claims: z.array(PublicClaimSchema).min(1),
});
export type PublicCaseDefinition = z.infer<typeof PublicCaseSchema>;
