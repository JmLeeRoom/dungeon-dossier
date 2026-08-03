import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  LocalizationKeySchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from './primitives';

export const DialogueSpanSchema = z
  .strictObject({
    claim_id: ContentIdSchema,
    start: NonNegativeIntegerSchema,
    end: NonNegativeIntegerSchema,
  })
  .refine((span) => span.end > span.start, {
    message: 'dialogue span end must be greater than start',
    path: ['end'],
  });

export const SpeakerProfileSchema = z.strictObject({
  race: NonEmptyStringSchema,
  personality: z.array(NonEmptyStringSchema).min(1),
  speech: NonEmptyStringSchema,
  forbidden_expressions: z.array(NonEmptyStringSchema),
});

export const StatementFallbackSchema = z.strictObject({
  fallback: z.array(NonEmptyStringSchema).min(1),
  spans: z.array(DialogueSpanSchema).min(1),
});

export const DialogueSchema = z.strictObject({
  speaker_profiles: z.record(ContentIdSchema, SpeakerProfileSchema),
  statements: z.record(ContentIdSchema, StatementFallbackSchema),
  reactions: z.record(LocalizationKeySchema, z.array(NonEmptyStringSchema).min(1)),
  confession: z.strictObject({
    full: z.array(NonEmptyStringSchema).min(1),
    coerced: z.array(NonEmptyStringSchema).min(1),
  }),
});
export type DialogueDefinition = z.infer<typeof DialogueSchema>;
