import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  ConditionSchema,
  EffectSchema,
  JsonSchemaReferenceSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  PositiveIntegerSchema,
  VersionSchema,
} from './primitives';

export const RelicSchema = z.strictObject({
  relic_id: ContentIdSchema,
  name_key: LocalizationKeySchema,
  description_key: LocalizationKeySchema,
  rarity: z.enum(['COMMON', 'RARE', 'CASE', 'LEGENDARY']),
  acquisition: NonEmptyStringSchema,
  activation: z.enum(['PASSIVE', 'ENCOUNTER_START', 'MANUAL', 'ON_RESOLUTION']),
  conditions: z.array(ConditionSchema),
  effects: z.array(EffectSchema).min(1),
  uses_per_encounter: PositiveIntegerSchema.optional(),
  linked_flag_id: ContentIdSchema.optional(),
});
export type RelicDefinition = z.infer<typeof RelicSchema>;

export const RelicsSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    relics: z.array(RelicSchema),
  })
  .superRefine((catalogue, context) => {
    const seen = new Set<string>();
    catalogue.relics.forEach((relic, index) => {
      if (seen.has(relic.relic_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate relic_id: ${relic.relic_id}`,
          path: ['relics', index, 'relic_id'],
        });
      }
      seen.add(relic.relic_id);
    });
  });
export type RelicsDefinition = z.infer<typeof RelicsSchema>;
