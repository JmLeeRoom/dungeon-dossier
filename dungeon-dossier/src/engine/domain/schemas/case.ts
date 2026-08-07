import { z } from 'zod';

import {
  ActionIntentSchema,
  CommitmentStateSchema,
  ContentIdSchema,
  FacetSchema,
  GradeSchema,
} from '../vocabulary';
import { PublicClaimSchema, TruthClaimSchema } from './claim';
import { EventCutscenesSchema } from './cutscene';
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

/** Run events can spend only the resources that actually live in RunState. */
export const RunEventCostSchema = z
  .strictObject({
    stress: NonNegativeNumberSchema.optional(),
    dp: NonNegativeNumberSchema.optional(),
    trust: NonNegativeNumberSchema.optional(),
  })
  .refine(
    (cost) => Object.values(cost).some((value) => value !== undefined && value > 0),
    { message: 'a run-event cost must spend at least one positive resource amount' },
  );
export type RunEventCost = z.infer<typeof RunEventCostSchema>;

/** Flags stay scalar so authoring, runtime FlagStore, and saves share one shape. */
export const RunFlagValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string(),
]);

const NonZeroRunResourceDeltaSchema = z.number().finite().refine(
  (value) => value !== 0,
  { message: 'resource adjustment delta must be non-zero' },
);

/** One effect changes one target. Multiple targets are authored as multiple effects. */
export const RunEffectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('GRANT_EVIDENCE'),
    target: ContentIdSchema,
  }),
  z.strictObject({
    type: z.literal('ADJUST_RESOURCE'),
    resource: z.enum(['stress', 'dp', 'trust']),
    delta: NonZeroRunResourceDeltaSchema,
  }),
  z.strictObject({
    type: z.literal('UPGRADE_EVIDENCE'),
    target: ContentIdSchema,
    /** Explicit destination; semantic validation requires the next authored grade. */
    to: GradeSchema,
  }),
  z.strictObject({
    type: z.literal('OPEN_ROUTE'),
    target: ContentIdSchema,
  }),
  z.strictObject({
    type: z.literal('SET_FLAG'),
    target: ContentIdSchema,
    value: RunFlagValueSchema,
  }),
]);
export type RunEffect = z.infer<typeof RunEffectSchema>;

const NonCombatBaseShape = {
  event_id: ContentIdSchema,
  node: ContentIdSchema,
  title_key: LocalizationKeySchema,
  description_key: LocalizationKeySchema,
  /** Optional BEFORE/AFTER cutscenes framing this node. */
  cutscenes: EventCutscenesSchema.default([]),
};

/** Bound shared by authored tuning, accumulated RunState tuning, and saves. */
export const MAX_ABS_CARD_TUNING = 10_000;
const CardTuningDeltaSchema = z
  .number()
  .finite()
  .min(-MAX_ABS_CARD_TUNING)
  .max(MAX_ABS_CARD_TUNING);
const CardCpTuningDeltaSchema = CardTuningDeltaSchema.int().safe();

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

/** D — card enhancement: permanently tunes one owned card definition. */
export const EnhanceCardEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('D'),
  /** Required soft-lock fallback when no owned card is eligible. */
  fallback_gains: z.array(RunEffectSchema).min(1),
  /** Offered tuning options; the player picks exactly one. */
  options: z
    .array(
      z.strictObject({
        option_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        /** Deterministic BEST autoplay tie-break only; never reorders gameplay or UI. */
        autoplay_priority: NonNegativeIntegerSchema.max(10_000).default(0),
        costs: RunEventCostSchema.optional(),
        /** Restricts which owned card definitions this option may target. Empty = any. */
        eligible_intents: z.array(ActionIntentSchema).default([]),
        tuning: z
          .strictObject({
            cp_delta: CardCpTuningDeltaSchema.optional(),
            composure_damage_delta: CardTuningDeltaSchema.optional(),
            coercion_delta: CardTuningDeltaSchema.optional(),
          })
          .refine(
            (tuning) =>
              Object.values(tuning).some(
                (value) => value !== undefined && value !== 0,
              ),
            { message: 'a tuning must change at least one stat' },
          ),
        /** Optional narrative/resource payoff committed after the tuning. */
        effects: z.array(RunEffectSchema).default([]),
      }),
    )
    .min(2),
});

/** E — canvassing: questioning bystanders opens statement hints and leads. */
export const CanvassEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('E'),
  attempt_limit: z.number().int().positive(),
  per_attempt_costs: RunEventCostSchema,
  topics: z
    .array(
      z.strictObject({
        topic_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        /** Shown after the topic is canvassed; this is the payoff text. */
        reveal_key: LocalizationKeySchema,
        effects: z.array(RunEffectSchema).min(1),
      }),
    )
    .min(2),
});

/** F — forensic collection: sweeping the scene puts new evidence in the pouch. */
export const CollectEvidenceEventSchema = z.strictObject({
  ...NonCombatBaseShape,
  pattern: z.literal('F'),
  attempt_limit: z.number().int().positive(),
  per_attempt_costs: RunEventCostSchema,
  targets: z
    .array(
      z.strictObject({
        target_id: ContentIdSchema,
        label_key: LocalizationKeySchema,
        evidence_id: ContentIdSchema,
        /** Forensic grade granted on collection. */
        grade: GradeSchema,
        effects: z.array(RunEffectSchema).default([]),
      }),
    )
    .min(2),
});

export const NonCombatEventSchema = z.discriminatedUnion('pattern', [
  ChoiceEventSchema,
  PlacementEventSchema,
  InvestigationEventSchema,
  EnhanceCardEventSchema,
  CanvassEventSchema,
  CollectEvidenceEventSchema,
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
