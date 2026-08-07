import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  EffectSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
} from './primitives';

export const CutsceneTimingSchema = z.enum(['BEFORE', 'AFTER']);
export const CUTSCENE_TIMINGS = CutsceneTimingSchema.options;
export type CutsceneTiming = z.infer<typeof CutsceneTimingSchema>;

export const CutscenePortraitSideSchema = z.enum(['LEFT', 'RIGHT']);
export const CUTSCENE_PORTRAIT_SIDES = CutscenePortraitSideSchema.options;
export type CutscenePortraitSide = z.infer<typeof CutscenePortraitSideSchema>;

/**
 * Presentation vocabulary shared with the renderer's own treatment table. The
 * renderer keeps a structurally identical list so that `src/ui` never reaches
 * into the engine; a catalogue equality test guards the two against drift.
 */
export const CutsceneTreatmentSchema = z.enum([
  'NONE',
  'FADE_IN',
  'FADE_OUT',
  'SHAKE',
  'FLASH',
  'SLOW_FADE',
]);
export const CUTSCENE_TREATMENTS = CutsceneTreatmentSchema.options;
export type CutsceneTreatment = z.infer<typeof CutsceneTreatmentSchema>;

export const MAX_CUTSCENE_BEAT_DURATION_MS = 20_000;
export const DEFAULT_CUTSCENE_BEAT_DURATION_MS = 2_400;
export const MAX_CUTSCENE_BEATS = 64;
export const MAX_CUTSCENE_BEAT_CHOICES = 4;
export const MAX_EVENT_CUTSCENES = 2;

export const CutscenePortraitSchema = z.strictObject({
  side: CutscenePortraitSideSchema,
  asset_key: NonEmptyStringSchema,
  dim: z.boolean().default(false),
});
export type CutscenePortraitDefinition = z.infer<typeof CutscenePortraitSchema>;

export const CutsceneChoiceSchema = z.strictObject({
  choice_id: ContentIdSchema,
  label_key: LocalizationKeySchema,
  /** Beat to jump to; omit to fall through to the next beat. */
  goto_beat_id: ContentIdSchema.optional(),
  /** Committed through the same run-layer path as a pattern A choice. */
  sets_flags: z.record(z.string(), z.json()).default({}),
  gains: z.array(EffectSchema).default([]),
});
export type CutsceneChoiceDefinition = z.infer<typeof CutsceneChoiceSchema>;

export const CutsceneBeatSchema = z.strictObject({
  beat_id: ContentIdSchema,
  /** Background swap; omit to keep the previous beat's background. */
  background_asset_key: NonEmptyStringSchema.optional(),
  /** Up to two speakers, one per side. */
  portraits: z.array(CutscenePortraitSchema).max(2).default([]),
  speaker_name_key: LocalizationKeySchema.optional(),
  text_key: LocalizationKeySchema,
  /** Declarative camera/transition treatment; renderers never branch on ids. */
  treatment: CutsceneTreatmentSchema.default('NONE'),
  audio_cue: NonEmptyStringSchema.optional(),
  duration_ms: z
    .number()
    .int()
    .positive()
    .max(MAX_CUTSCENE_BEAT_DURATION_MS)
    .default(DEFAULT_CUTSCENE_BEAT_DURATION_MS),
  /** Branch point. When present the beat waits for input instead of auto-advancing. */
  choices: z.array(CutsceneChoiceSchema).max(MAX_CUTSCENE_BEAT_CHOICES).default([]),
  /** Required on a choice beat when the containing cutscene is skippable. */
  default_choice_id: ContentIdSchema.optional(),
});
export type CutsceneBeatDefinition = z.infer<typeof CutsceneBeatSchema>;

export const CutsceneSchema = z.strictObject({
  cutscene_id: ContentIdSchema,
  /** Where this cutscene plays relative to its host node. */
  timing: CutsceneTimingSchema.default('BEFORE'),
  skippable: z.boolean().default(true),
  beats: z.array(CutsceneBeatSchema).min(1).max(MAX_CUTSCENE_BEATS),
});
export type CutsceneDefinition = z.infer<typeof CutsceneSchema>;

/**
 * A host node plays at most one cutscene per timing, so the collection is
 * keyed by timing rather than by order.
 */
export const EventCutscenesSchema = z
  .array(CutsceneSchema)
  .max(MAX_EVENT_CUTSCENES)
  .superRefine((items, context) => {
    const ids = new Set<string>();
    const timings = new Set<CutsceneTiming>();
    for (const [index, item] of items.entries()) {
      if (ids.has(item.cutscene_id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'cutscene_id'],
          message: 'duplicate cutscene id',
        });
      }
      if (timings.has(item.timing)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'timing'],
          message: 'duplicate cutscene timing',
        });
      }
      ids.add(item.cutscene_id);
      timings.add(item.timing);
    }
  })
  .default([]);
export type EventCutscenesDefinition = z.infer<typeof EventCutscenesSchema>;
