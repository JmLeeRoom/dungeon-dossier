import { z } from 'zod';

import {
  ContentIdSchema,
  GradeSchema,
  ProofScopeSchema,
  SourceCategorySchema,
} from '../vocabulary';
import {
  CostSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  ProbabilitySchema,
  TimeRangeSchema,
  uniqueContentIds,
} from './primitives';

export const EvidenceAcquireMethodSchema = z.enum([
  'STARTING',
  'EVENT_CHOICE',
  'EVENT_RESULT',
  'ENCOUNTER_OUTCOME',
  'INQUIRY',
  'FORENSIC',
  'FLAG_HOOK',
]);

export const EvidenceAcquireSchema = z.strictObject({
  node: ContentIdSchema,
  method: EvidenceAcquireMethodSchema,
});

export const EvidenceIndependenceSchema = z.strictObject({
  source_id: ContentIdSchema,
  group: SourceCategorySchema,
  derived_from: ContentIdSchema.nullable(),
});

export const EvidenceUpgradeSchema = z.strictObject({
  to: GradeSchema,
  cost: CostSchema,
  via: NonEmptyStringSchema,
});

export const EvidenceGradeSchema = z.strictObject({
  initial: GradeSchema,
  upgrades: z.array(EvidenceUpgradeSchema),
});

export const ObservationSchema = z.strictObject({
  observation_id: ContentIdSchema.optional(),
  subject_id: ContentIdSchema.optional(),
  object_id: ContentIdSchema.optional(),
  location_id: ContentIdSchema.optional(),
  predicate: NonEmptyStringSchema,
  summary_key: LocalizationKeySchema,
  scopes: z
    .array(ProofScopeSchema)
    .min(1)
    .superRefine((scopes, context) => {
      scopes.forEach((scope, index) => {
        if (scopes.indexOf(scope) !== index) {
          context.addIssue({
            code: 'custom',
            message: `duplicate proof scope: ${scope}`,
            path: [index],
          });
        }
      });
    }),
  detail: z.record(z.string(), z.json()),
  time: TimeRangeSchema.optional(),
  confidence: ProbabilitySchema,
  supports_claim_ids: uniqueContentIds().optional(),
  contradicts_claim_ids: uniqueContentIds().optional(),
  eliminates_hypotheses: uniqueContentIds().optional(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const EvidenceForensicsSchema = z.strictObject({
  available: z.boolean(),
  reveals: z.array(LocalizationKeySchema),
});

export const EvidenceSchema = z.strictObject({
  evidence_id: ContentIdSchema,
  type: NonEmptyStringSchema.optional(),
  title_key: LocalizationKeySchema,
  acquire: EvidenceAcquireSchema,
  source_category: SourceCategorySchema,
  independence: EvidenceIndependenceSchema,
  grade: EvidenceGradeSchema,
  integrity: z
    .strictObject({
      initial: z.enum(['INTACT', 'DEGRADED', 'DISPUTED', 'DESTROYED']),
      tamper_probability: ProbabilitySchema.optional(),
    })
    .optional(),
  observations: z.array(ObservationSchema).min(1),
  not_proven_keys: z.array(LocalizationKeySchema).min(1),
  alternative_hypotheses: uniqueContentIds().optional(),
  forensics: EvidenceForensicsSchema.optional(),
});
export type EvidenceDefinition = z.infer<typeof EvidenceSchema>;
