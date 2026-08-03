import { z } from 'zod';

import { ContentIdSchema, ProofScopeSchema } from '../vocabulary';
import { ProbabilitySchema, uniqueContentIds } from './primitives';

export const EvidenceSetSchema = uniqueContentIds(1);

export const ProofRequirementsSchema = z.strictObject({
  required_scopes: z
    .array(ProofScopeSchema)
    .min(1)
    .superRefine((scopes, context) => {
      scopes.forEach((scope, index) => {
        if (scopes.indexOf(scope) !== index) {
          context.addIssue({
            code: 'custom',
            message: `duplicate required scope: ${scope}`,
            path: [index],
          });
        }
      });
    }),
  minimum_confidence: ProbabilitySchema,
  minimum_independent_sources: z.number().int().positive(),
  require_integrity: z.boolean().optional(),
});

export const AlternateHypothesisSchema = z.strictObject({
  hypothesis_id: ContentIdSchema,
  disqualifying_evidence_sets: z.array(EvidenceSetSchema).min(1),
});

export const ProofRuleSchema = z.strictObject({
  rule_id: ContentIdSchema,
  target_claim_id: ContentIdSchema,
  direction: z.enum(['SUPPORT', 'CONTRADICT']),
  requirements: ProofRequirementsSchema,
  guaranteed_evidence_sets: z.array(EvidenceSetSchema).optional(),
  known_insufficient_sets: z.array(EvidenceSetSchema).optional(),
  partial_credit: z
    .strictObject({
      scopes_covered_ratio: ProbabilitySchema,
      result: z.literal('SUSPECTED'),
    })
    .optional(),
  alternate_hypotheses: z.array(AlternateHypothesisSchema).optional(),
});
export type ProofRule = z.infer<typeof ProofRuleSchema>;
