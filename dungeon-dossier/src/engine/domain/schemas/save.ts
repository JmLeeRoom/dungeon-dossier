import { z } from 'zod';

import {
  CommitmentStateSchema,
  ContentIdSchema,
  EpistemicStateSchema,
  GradeSchema,
  PresentationStateSchema,
} from '../vocabulary';
import {
  JsonSchemaReferenceSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  VersionSchema,
  uniqueContentIds,
} from './primitives';
import { CaseGradeSchema } from './grades';
import { OutcomeGradeSchema } from './encounter';

export const CURRENT_SAVE_VERSION = 1 as const;

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

export const SavedRunStateSchema = z.strictObject({
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
});

export const SaveSchema = z.strictObject({
  $schema: JsonSchemaReferenceSchema.optional(),
  save_version: z.literal(CURRENT_SAVE_VERSION),
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
  /** Optional for backward-compatible v1 saves created before the run layer. */
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
 * Stable migration entrypoint. Version 1 is the first persisted contract; new
 * migrations are added here in ascending order before parsing the current form.
 */
export function migrateSave(input: unknown): SaveData {
  const probe = SaveVersionProbeSchema.parse(input);
  if (probe.save_version !== CURRENT_SAVE_VERSION) {
    throw new UnsupportedSaveVersionError(probe.save_version);
  }
  return SaveSchema.parse(input);
}
