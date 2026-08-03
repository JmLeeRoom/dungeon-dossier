import { z } from 'zod';

import { ActionIntentSchema, ContentIdSchema, FacetSchema } from '../vocabulary';
import {
  CostSchema,
  EffectSchema,
  JsonSchemaReferenceSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  VersionSchema,
  uniqueContentIds,
} from './primitives';

export const EnhancementSchema = z.strictObject({
  enhancement_id: ContentIdSchema,
  name_key: LocalizationKeySchema,
  description_key: LocalizationKeySchema,
  type: z.enum(['STAMP', 'POST_IT', 'CLIP']),
  color: z.enum(['BLUE', 'RED']).optional(),
  facet: FacetSchema.optional(),
  compatible_intents: z.array(ActionIntentSchema).optional(),
  compatible_card_ids: uniqueContentIds().optional(),
  merge_card_ids: uniqueContentIds(2).optional(),
  result_card_id: ContentIdSchema.optional(),
  cost: CostSchema.optional(),
  effects: z.array(EffectSchema).min(1),
  acquisition: NonEmptyStringSchema.optional(),
});
export type EnhancementDefinition = z.infer<typeof EnhancementSchema>;

export const EnhancementsSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    enhancements: z.array(EnhancementSchema),
  })
  .superRefine((catalogue, context) => {
    const seen = new Set<string>();
    catalogue.enhancements.forEach((enhancement, index) => {
      if (seen.has(enhancement.enhancement_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate enhancement_id: ${enhancement.enhancement_id}`,
          path: ['enhancements', index, 'enhancement_id'],
        });
      }
      seen.add(enhancement.enhancement_id);
    });
  });
export type EnhancementsDefinition = z.infer<typeof EnhancementsSchema>;
