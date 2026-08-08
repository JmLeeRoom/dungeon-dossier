import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  JsonSchemaReferenceSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  VersionSchema,
} from './primitives';

export const RunNodeKindSchema = z.enum(['ENCOUNTER', 'EVENT', 'BOSS']);
export type RunNodeKind = z.infer<typeof RunNodeKindSchema>;

/**
 * Every episode is exactly these three stages in this order. The role is the
 * progression contract; `kind` stays as the renderer/engine-facing node type.
 */
export const RunSlotRoleSchema = z.enum(['COMBAT', 'EVENT', 'BOSS']);
export type RunSlotRole = z.infer<typeof RunSlotRoleSchema>;

export const EPISODE_SLOT_ORDER = ['COMBAT', 'EVENT', 'BOSS'] as const;
/** Resolved nodes per episode. The run length is this times the episode count. */
export const EPISODE_NODE_COUNT = EPISODE_SLOT_ORDER.length;

/** FIXED always resolves `candidates[0]`; SEEDED_ONE draws one per run seed. */
export const RunSlotSelectionSchema = z.enum(['FIXED', 'SEEDED_ONE']);
export type RunSlotSelection = z.infer<typeof RunSlotSelectionSchema>;

/** A slot role accepts candidates of exactly one node kind. */
export const NODE_KIND_BY_SLOT_ROLE: Readonly<Record<RunSlotRole, RunNodeKind>> = {
  COMBAT: 'ENCOUNTER',
  EVENT: 'EVENT',
  BOSS: 'BOSS',
};

export const RunStripCandidateSchema = z.strictObject({
  node_id: ContentIdSchema,
  kind: RunNodeKindSchema,
  ref: ContentIdSchema,
});
export type RunStripCandidateDefinition = z.infer<typeof RunStripCandidateSchema>;

export const RunStripSlotSchema = z.strictObject({
  role: RunSlotRoleSchema,
  selection: RunSlotSelectionSchema,
  candidates: z.array(RunStripCandidateSchema).min(1),
});
export type RunStripSlotDefinition = z.infer<typeof RunStripSlotSchema>;

export const RunEpisodeSchema = z.strictObject({
  episode_id: NonEmptyStringSchema,
  sequence_index: NonNegativeIntegerSchema,
  case_directory: NonEmptyStringSchema,
  slots: z.array(RunStripSlotSchema).length(EPISODE_NODE_COUNT),
});
export type RunEpisodeDefinition = z.infer<typeof RunEpisodeSchema>;

export const RunStripSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    episodes: z.array(RunEpisodeSchema).min(1),
  })
  .superRefine((strip, context) => {
    const seenNodeIds = new Set<string>();
    const seenEpisodeIds = new Set<string>();
    const seenSequenceIndices = new Set<number>();

    strip.episodes.forEach((episode, episodeIndex) => {
      if (seenEpisodeIds.has(episode.episode_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate episode: ${episode.episode_id}`,
          path: ['episodes', episodeIndex, 'episode_id'],
        });
      }
      seenEpisodeIds.add(episode.episode_id);

      if (seenSequenceIndices.has(episode.sequence_index)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate sequence_index: ${episode.sequence_index}`,
          path: ['episodes', episodeIndex, 'sequence_index'],
        });
      }
      seenSequenceIndices.add(episode.sequence_index);

      // Declaration order is the play order, so a mismatch would make the
      // unlock chain disagree with the array the engine walks.
      if (episode.sequence_index !== episodeIndex) {
        context.addIssue({
          code: 'custom',
          message:
            `sequence_index must equal the declaration order ` +
            `(expected ${episodeIndex}, received ${episode.sequence_index})`,
          path: ['episodes', episodeIndex, 'sequence_index'],
        });
      }

      episode.slots.forEach((slot, slotIndex) => {
        const expectedRole = EPISODE_SLOT_ORDER[slotIndex];
        if (slot.role !== expectedRole) {
          context.addIssue({
            code: 'custom',
            message: `slot ${slotIndex} must be ${expectedRole}, received ${slot.role}`,
            path: ['episodes', episodeIndex, 'slots', slotIndex, 'role'],
          });
        }

        const expectedKind = NODE_KIND_BY_SLOT_ROLE[slot.role];
        slot.candidates.forEach((candidate, candidateIndex) => {
          if (candidate.kind !== expectedKind) {
            context.addIssue({
              code: 'custom',
              message:
                `${slot.role} candidates must be ${expectedKind} nodes, ` +
                `received ${candidate.kind}`,
              path: [
                'episodes',
                episodeIndex,
                'slots',
                slotIndex,
                'candidates',
                candidateIndex,
                'kind',
              ],
            });
          }
          if (seenNodeIds.has(candidate.node_id)) {
            context.addIssue({
              code: 'custom',
              message: `duplicate run node: ${candidate.node_id}`,
              path: [
                'episodes',
                episodeIndex,
                'slots',
                slotIndex,
                'candidates',
                candidateIndex,
                'node_id',
              ],
            });
          }
          seenNodeIds.add(candidate.node_id);
        });
      });
    });
  });
export type RunStripDefinition = z.infer<typeof RunStripSchema>;
