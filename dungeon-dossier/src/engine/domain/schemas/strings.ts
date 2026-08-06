import { z } from 'zod';

import { JsonSchemaReferenceSchema, VersionSchema } from './primitives';

/** Flat localization table: content `*_key` identifiers to display text. */
export const StringsSchema = z.strictObject({
  $schema: JsonSchemaReferenceSchema.optional(),
  schema_version: VersionSchema,
  locale: z.string().min(2),
  strings: z.record(z.string().min(1), z.string().min(1)),
});
export type StringsDefinition = z.infer<typeof StringsSchema>;
