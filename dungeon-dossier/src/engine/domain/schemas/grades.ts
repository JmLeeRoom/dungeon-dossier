import { z } from 'zod';

import {
  JsonSchemaReferenceSchema,
  LocalizationKeySchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  ProbabilitySchema,
  VersionSchema,
} from './primitives';

export const CaseGradeSchema = z.enum(['S', 'A', 'B', 'C', 'D', 'F']);

export const CaseGradeRequirementsSchema = z
  .strictObject({
    required_claim_resolution_ratio_min: ProbabilitySchema.optional(),
    optional_objective_ratio_min: ProbabilitySchema.optional(),
    require_sweet_spot_finish: z.boolean().optional(),
    require_originals_preserved: z.boolean().optional(),
    coercion_max: NonNegativeNumberSchema.optional(),
    false_confessions_max: NonNegativeIntegerSchema.optional(),
  })
  .refine((requirements) => Object.keys(requirements).length > 0, {
    message: 'grade requirements cannot be empty',
  });

export const CaseGradeDefinitionSchema = z.strictObject({
  grade: CaseGradeSchema,
  label_key: LocalizationKeySchema,
  priority: z.number().int(),
  requirements: CaseGradeRequirementsSchema,
});
export type CaseGradeDefinition = z.infer<typeof CaseGradeDefinitionSchema>;

export const GradesSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    grades: z.array(CaseGradeDefinitionSchema).length(6),
  })
  .superRefine((catalogue, context) => {
    const seen = new Set<string>();
    catalogue.grades.forEach((grade, index) => {
      if (seen.has(grade.grade)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate case grade: ${grade.grade}`,
          path: ['grades', index, 'grade'],
        });
      }
      seen.add(grade.grade);
    });
  });
export type GradesDefinition = z.infer<typeof GradesSchema>;
