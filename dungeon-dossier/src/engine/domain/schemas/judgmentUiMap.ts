import { z } from 'zod';

import {
  FacetSchema,
  ProofScopeSchema,
  type ResolutionCode,
} from '../vocabulary';
import {
  JsonSchemaReferenceSchema,
  LocalizationKeySchema,
  VersionSchema,
} from './primitives';

export const JudgmentCategorySchema = z.enum([
  'DIRECT_CONTRADICTION',
  'INDIRECT_SUSPICION',
  'INSUFFICIENT_GROUNDS',
  'TRUTH_ATTACKED',
]);

export const JudgmentUiEntrySchema = z.strictObject({
  label_key: LocalizationKeySchema,
  feedback_key: LocalizationKeySchema,
  category: JudgmentCategorySchema,
});

const EVIDENCE_CODE_CATEGORIES = {
  R_DIRECT_CONTRADICTION: 'DIRECT_CONTRADICTION',
  R_INDIRECT_SUSPICION: 'INDIRECT_SUSPICION',
  R_INSUFFICIENT_GROUNDS: 'INSUFFICIENT_GROUNDS',
  R_TRUTH_ATTACKED: 'TRUTH_ATTACKED',
  R_IRRELEVANT_EVIDENCE: 'INSUFFICIENT_GROUNDS',
} as const;

const ResolutionCodeUiShape = {
  R_DIRECT_CONTRADICTION: JudgmentUiEntrySchema,
  R_INDIRECT_SUSPICION: JudgmentUiEntrySchema,
  R_INSUFFICIENT_GROUNDS: JudgmentUiEntrySchema,
  R_TRUTH_ATTACKED: JudgmentUiEntrySchema,
  R_IRRELEVANT_EVIDENCE: JudgmentUiEntrySchema,
  R_CONFIRM_LOCKED: JudgmentUiEntrySchema.optional(),
  R_CONFIRM_PROVISIONAL: JudgmentUiEntrySchema.optional(),
  R_CONFIRM_CONFLICT: JudgmentUiEntrySchema.optional(),
  R_QUERY_SUCCESS: JudgmentUiEntrySchema.optional(),
  R_QUERY_BLOCKED: JudgmentUiEntrySchema.optional(),
  R_CLARIFY_SUCCESS: JudgmentUiEntrySchema.optional(),
  R_CLARIFY_NOOP: JudgmentUiEntrySchema.optional(),
  R_COMMIT_SUCCESS: JudgmentUiEntrySchema.optional(),
  R_COMMIT_REFUSED: JudgmentUiEntrySchema.optional(),
  R_FORENSIC_REVEALED: JudgmentUiEntrySchema.optional(),
  R_PRESSURE_APPLIED: JudgmentUiEntrySchema.optional(),
  R_PRESSURE_BACKFIRE: JudgmentUiEntrySchema.optional(),
  R_RECOVER_APPLIED: JudgmentUiEntrySchema.optional(),
  R_SPECIAL_APPLIED: JudgmentUiEntrySchema.optional(),
  R_ACTION_INVALID: JudgmentUiEntrySchema.optional(),
  R_PROCEDURE_VIOLATION: JudgmentUiEntrySchema.optional(),
} satisfies Readonly<Record<ResolutionCode, z.ZodType>>;

const ResolutionCodeUiMapSchema = z
  .strictObject(ResolutionCodeUiShape)
  .superRefine((entries, context) => {
    for (const [code, category] of Object.entries(EVIDENCE_CODE_CATEGORIES)) {
      const entry = entries[code as keyof typeof EVIDENCE_CODE_CATEGORIES];
      if (entry.category !== category) {
        context.addIssue({
          code: 'custom',
          message: `${code} must map to ${category}`,
          path: [code, 'category'],
        });
      }
    }

    if (
      entries.R_IRRELEVANT_EVIDENCE.feedback_key ===
      entries.R_INSUFFICIENT_GROUNDS.feedback_key
    ) {
      context.addIssue({
        code: 'custom',
        message: 'irrelevant evidence requires a dedicated feedback string',
        path: ['R_IRRELEVANT_EVIDENCE', 'feedback_key'],
      });
    }
  });

export const JudgmentUiMapSchema = z.strictObject({
  $schema: JsonSchemaReferenceSchema.optional(),
  schema_version: VersionSchema,
  categories: z.record(
    JudgmentCategorySchema,
    z.strictObject({ label_key: LocalizationKeySchema }),
  ),
  facets: z.record(
    FacetSchema,
    z.strictObject({ label_key: LocalizationKeySchema }),
  ),
  proof_scopes: z.record(
    ProofScopeSchema,
    z.strictObject({
      label_key: LocalizationKeySchema,
      missing_feedback_key: LocalizationKeySchema,
    }),
  ),
  resolution_codes: ResolutionCodeUiMapSchema,
});
export type JudgmentUiMapDefinition = z.infer<typeof JudgmentUiMapSchema>;
