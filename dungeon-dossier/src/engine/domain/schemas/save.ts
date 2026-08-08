import { z } from 'zod';

import {
  CommitmentStateSchema,
  ContentIdSchema,
  EpistemicStateSchema,
  GradeSchema,
  PresentationStateSchema,
} from '../vocabulary';
import { MAX_ABS_CARD_TUNING } from './case';
import {
  JsonSchemaReferenceSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  VersionSchema,
  uniqueContentIds,
} from './primitives';
import { CaseGradeSchema } from './grades';
import { OutcomeGradeSchema } from './encounter';

export const CURRENT_SAVE_VERSION = 3 as const;

export const SavedClaimStateSchema = z.strictObject({
  claim_id: ContentIdSchema,
  commitment: CommitmentStateSchema,
  epistemic: EpistemicStateSchema,
  presentation: PresentationStateSchema,
  resistance: NonNegativeIntegerSchema,
  exposed: z.boolean(),
});

export const SavedEvidenceStateSchema = z.strictObject({
  evidence_id: ContentIdSchema,
  acquired: z.boolean(),
  grade: GradeSchema,
  integrity: z.enum(['INTACT', 'DEGRADED', 'DISPUTED', 'DESTROYED']),
  sealed_until_turn: NonNegativeIntegerSchema.nullable(),
  revealed_details: z.array(z.string()),
});

export const SavedDeckStateSchema = z.strictObject({
  draw_pile: z.array(ContentIdSchema),
  hand: z.array(ContentIdSchema),
  discard_pile: z.array(ContentIdSchema),
  exhaust_pile: z.array(ContentIdSchema),
  locked_cards: z.record(ContentIdSchema, NonNegativeIntegerSchema),
});

export const SavedResourcesSchema = z.strictObject({
  cp: NonNegativeNumberSchema,
  stress: NonNegativeNumberSchema,
  dp: NonNegativeNumberSchema,
  composure: NonNegativeNumberSchema,
  coercion: NonNegativeNumberSchema,
  trust: NonNegativeNumberSchema,
  turn: NonNegativeIntegerSchema,
});

export const SavedEncounterStateSchema = z.strictObject({
  encounter_id: ContentIdSchema,
  flow_node_id: ContentIdSchema,
  round_index: NonNegativeIntegerSchema,
  entered_flow_nodes: uniqueContentIds(),
  active_modifiers: uniqueContentIds(),
  completed_objectives: uniqueContentIds(),
  shield_durability: z.record(ContentIdSchema, NonNegativeNumberSchema),
});

const SavedRunStateV1Shape = {
  node_index: NonNegativeIntegerSchema,
  reward_seed_stream: z.number().int().min(0).max(0xffff_ffff),
  false_confessions: NonNegativeIntegerSchema,
  completed_node_ids: uniqueContentIds(),
  pending_reward_ids: uniqueContentIds(),
  claimed_reward_ids: uniqueContentIds(),
  acquired_evidence_ids: uniqueContentIds(),
  grade_history: z.array(z.strictObject({
    node_id: ContentIdSchema,
    outcome: OutcomeGradeSchema,
    grade: CaseGradeSchema,
  })),
  outcome_history: z.array(z.strictObject({
    node_id: ContentIdSchema,
    outcome: OutcomeGradeSchema,
  })),
  terminal: z.boolean(),
} as const;

const SavedCardTuningSchema = z.strictObject({
  cp_delta: z.number().int().safe().min(-MAX_ABS_CARD_TUNING).max(MAX_ABS_CARD_TUNING),
  composure_damage_delta: z
    .number()
    .finite()
    .min(-MAX_ABS_CARD_TUNING)
    .max(MAX_ABS_CARD_TUNING),
  coercion_delta: z
    .number()
    .finite()
    .min(-MAX_ABS_CARD_TUNING)
    .max(MAX_ABS_CARD_TUNING),
});

/** v2 persists the pattern D/E/F run state that acquired-ID lists cannot express. */
const SavedRunStateV2Shape = {
  card_tuning: z.record(ContentIdSchema, SavedCardTuningSchema),
  canvassed_topic_ids: uniqueContentIds(),
  evidence_grade_by_id: z.record(ContentIdSchema, GradeSchema),
  open_route_ids: uniqueContentIds(),
  retry_count: NonNegativeIntegerSchema,
} as const;

/**
 * v3 persists the episode progression the 3-stage run introduced, plus the
 * resolved route. The route is stored rather than re-derived from the seed so a
 * later candidate-pool edit can never silently relocate an in-flight save.
 */
const SavedRunStateV3Shape = {
  active_episode_id: NonEmptyStringSchema,
  unlocked_episode_ids: z.array(NonEmptyStringSchema),
  completed_episode_ids: z.array(NonEmptyStringSchema),
  route_node_ids: uniqueContentIds(),
} as const;

const SavedRunStateV1Schema = z.strictObject(SavedRunStateV1Shape);
const SavedRunStateV2Schema = z.strictObject({
  ...SavedRunStateV1Shape,
  ...SavedRunStateV2Shape,
});

export const SavedRunStateSchema = z.strictObject({
  ...SavedRunStateV1Shape,
  ...SavedRunStateV2Shape,
  ...SavedRunStateV3Shape,
});

const SaveEnvelopeShape = {
  $schema: JsonSchemaReferenceSchema.optional(),
  case_id: ContentIdSchema,
  content_version: VersionSchema,
  run_seed: z.number().int().min(0).max(0xffff_ffff),
  claims: z.array(SavedClaimStateSchema),
  evidence: z.array(SavedEvidenceStateSchema),
  deck: SavedDeckStateSchema,
  flags: z.record(z.string(), z.union([z.boolean(), z.number().finite(), z.string()])),
  resources: SavedResourcesSchema,
  encounter: SavedEncounterStateSchema.nullable(),
  used_routes: uniqueContentIds(),
  acquired_relics: uniqueContentIds(),
  acquired_enhancements: uniqueContentIds(),
} as const;

const SaveV1Schema = z.strictObject({
  ...SaveEnvelopeShape,
  save_version: z.literal(1),
  run: SavedRunStateV1Schema.optional(),
});

const SaveV2Schema = z.strictObject({
  ...SaveEnvelopeShape,
  save_version: z.literal(2),
  run: SavedRunStateV2Schema.optional(),
});

export const SaveSchema = z.strictObject({
  ...SaveEnvelopeShape,
  save_version: z.literal(CURRENT_SAVE_VERSION),
  /** Optional for backward-compatible saves created before the run layer. */
  run: SavedRunStateSchema.optional(),
});
export type SaveData = z.infer<typeof SaveSchema>;

const SaveVersionProbeSchema = z.looseObject({
  save_version: PositiveIntegerSchema,
});

export class UnsupportedSaveVersionError extends Error {
  public constructor(public readonly saveVersion: number) {
    super(`Unsupported save version: ${saveVersion}`);
    this.name = 'UnsupportedSaveVersionError';
  }
}

/**
 * v1 predates pattern D/E/F, so its run boundary genuinely has no tuning,
 * canvassed topic, grade override, opened route, or retry. Defaults are filled
 * once here and handed to the next migration rather than to each reading layer.
 */
function migrateSaveV1ToV2(input: unknown): unknown {
  const legacy = SaveV1Schema.parse(input);
  return {
    ...legacy,
    save_version: 2,
    ...(legacy.run === undefined
      ? {}
      : {
          run: {
            ...legacy.run,
            card_tuning: {},
            canvassed_topic_ids: [],
            evidence_grade_by_id: {},
            open_route_ids: [],
            retry_count: 0,
          },
        }),
  };
}

/**
 * v2 predates episodes. Its flat cursor cannot say which episode it stood in,
 * so the fields are left blank here on purpose: the app re-derives them from
 * the resolved route on restore, which is the only source that can be right.
 */
function migrateSaveV2ToV3(input: unknown): SaveData {
  const legacy = SaveV2Schema.parse(input);
  return SaveSchema.parse({
    ...legacy,
    save_version: CURRENT_SAVE_VERSION,
    ...(legacy.run === undefined
      ? {}
      : {
          run: {
            ...legacy.run,
            active_episode_id: LEGACY_EPISODE_PLACEHOLDER,
            unlocked_episode_ids: [],
            completed_episode_ids: [],
            route_node_ids: [],
          },
        }),
  });
}

/**
 * Marks a run block whose episode fields came from a pre-episode save. The app
 * layer replaces it with the route-derived value instead of trusting it.
 */
export const LEGACY_EPISODE_PLACEHOLDER = 'legacy';

/**
 * Stable migration entrypoint. Migrations run in ascending order before the
 * document is parsed as the current contract.
 */
export function migrateSave(input: unknown): SaveData {
  const probe = SaveVersionProbeSchema.parse(input);
  if (probe.save_version === CURRENT_SAVE_VERSION) return SaveSchema.parse(input);
  if (probe.save_version === 1) return migrateSaveV2ToV3(migrateSaveV1ToV2(input));
  if (probe.save_version === 2) return migrateSaveV2ToV3(input);
  throw new UnsupportedSaveVersionError(probe.save_version);
}
