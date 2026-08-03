import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  JsonSchemaReferenceSchema,
  NonEmptyStringSchema,
  VersionSchema,
} from './primitives';

export const RunNodeKindSchema = z.enum(['ENCOUNTER', 'EVENT', 'BOSS']);
export type RunNodeKind = z.infer<typeof RunNodeKindSchema>;

export const RunStripNodeSchema = z.strictObject({
  node_id: ContentIdSchema,
  kind: RunNodeKindSchema,
  ref: ContentIdSchema,
  case_directory: NonEmptyStringSchema,
});
export type RunStripNodeDefinition = z.infer<typeof RunStripNodeSchema>;

export const RunStripSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    nodes: z.array(RunStripNodeSchema).length(15),
  })
  .superRefine((strip, context) => {
    const seen = new Set<string>();
    strip.nodes.forEach((node, index) => {
      if (seen.has(node.node_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate run node: ${node.node_id}`,
          path: ['nodes', index, 'node_id'],
        });
      }
      seen.add(node.node_id);
    });
  });
export type RunStripDefinition = z.infer<typeof RunStripSchema>;
