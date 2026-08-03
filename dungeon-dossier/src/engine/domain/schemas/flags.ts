import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  ConditionSchema,
  EffectSchema,
  JsonSchemaReferenceSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  VersionSchema,
} from './primitives';

export const FlagIdSchema = z
  .string()
  .regex(/^F-(?:0[1-9]|1[0-3])$/, 'flag_id must be in the range F-01 through F-13');

export const FlagSetHookSchema = z
  .strictObject({
    encounter: ContentIdSchema.optional(),
    event: ContentIdSchema.optional(),
    choice: ContentIdSchema.optional(),
    outcome: NonEmptyStringSchema.optional(),
    condition: ConditionSchema.optional(),
    value: z.json().optional(),
  })
  .refine(
    (hook) =>
      hook.encounter !== undefined ||
      hook.event !== undefined ||
      hook.choice !== undefined ||
      hook.condition !== undefined,
    { message: 'set_by must identify an encounter, event, choice, or condition' },
  );

export const FlagConsumeHookSchema = z.strictObject({
  encounter: ContentIdSchema,
  condition: ConditionSchema.optional(),
  apply: EffectSchema,
});

export const FlagDefinitionSchema = z.strictObject({
  flag_id: FlagIdSchema,
  description_key: LocalizationKeySchema.optional(),
  default_value: z.json().optional(),
  set_by: z.array(FlagSetHookSchema).min(1),
  consumed_by: z.array(FlagConsumeHookSchema).min(1),
});
export type FlagDefinition = z.infer<typeof FlagDefinitionSchema>;

export const FlagsSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    flags: z.array(FlagDefinitionSchema).length(13),
  })
  .superRefine((catalogue, context) => {
    const seen = new Set<string>();
    catalogue.flags.forEach((flag, index) => {
      if (seen.has(flag.flag_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate flag_id: ${flag.flag_id}`,
          path: ['flags', index, 'flag_id'],
        });
      }
      seen.add(flag.flag_id);
    });
  });
export type FlagsDefinition = z.infer<typeof FlagsSchema>;
