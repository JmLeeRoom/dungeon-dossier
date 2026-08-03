import { z } from 'zod';

import {
  CommitmentStateSchema,
  ContentIdSchema,
  EpistemicStateSchema,
  FacetSchema,
  PresentationStateSchema,
  TruthRelationSchema,
} from '../vocabulary';
import {
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimeRangeSchema,
  uniqueContentIds,
} from './primitives';

export const PartnerSkillUnlockConditionSchema = z.strictObject({
  type: z.literal('PARTNER_SKILL'),
  skill_id: ContentIdSchema,
});

export const ConfirmedTruthCountUnlockConditionSchema = z.strictObject({
  type: z.literal('CONFIRMED_TRUTH_COUNT'),
  count: z.number().int().positive(),
});

export const FlagUnlockConditionSchema = z.strictObject({
  type: z.literal('FLAG_EQUALS'),
  flag_id: ContentIdSchema,
  value: z.json(),
});

export const EvidenceUnlockConditionSchema = z.strictObject({
  type: z.literal('EVIDENCE_ACQUIRED'),
  evidence_id: ContentIdSchema,
});

export const ClaimStateUnlockConditionSchema = z.strictObject({
  type: z.literal('CLAIM_STATE'),
  claim_id: ContentIdSchema,
  commitment: CommitmentStateSchema.optional(),
  epistemic: EpistemicStateSchema.optional(),
});

export const UnlockConditionSchema = z.discriminatedUnion('type', [
  PartnerSkillUnlockConditionSchema,
  ConfirmedTruthCountUnlockConditionSchema,
  FlagUnlockConditionSchema,
  EvidenceUnlockConditionSchema,
  ClaimStateUnlockConditionSchema,
]);
export type UnlockCondition = z.infer<typeof UnlockConditionSchema>;

export const ClaimLockSchema = z.strictObject({
  locked_at_start: z.boolean(),
  unlock_conditions: z.array(UnlockConditionSchema).min(1),
});
export type ClaimLock = z.infer<typeof ClaimLockSchema>;

export const ClaimInitialStateSchema = z.strictObject({
  commitment: CommitmentStateSchema,
  presentation: PresentationStateSchema,
});

const PublicClaimBaseSchema = z.strictObject({
  claim_id: ContentIdSchema,
  speaker: ContentIdSchema,
  subject_id: ContentIdSchema.optional(),
  object_id: ContentIdSchema.optional(),
  facet: FacetSchema,
  facet_group: z.array(FacetSchema).min(1).optional(),
  canonical_meaning: NonEmptyStringSchema,
  canonical_meaning_key: NonEmptyStringSchema.optional(),
  predicate: NonEmptyStringSchema,
  time_ref: TimeRangeSchema.optional(),
  initial: ClaimInitialStateSchema,
  lock: ClaimLockSchema.optional(),
  resistance: NonNegativeIntegerSchema.max(3).optional(),
  is_required: z.boolean().optional(),
  presentation_group: ContentIdSchema.optional(),
});

function validateLockInvariant(
  claim: z.infer<typeof PublicClaimBaseSchema>,
  context: z.RefinementCtx,
): void {
  if (
    claim.initial.commitment === 'UNSTATED' &&
    claim.initial.presentation !== 'HIDDEN'
  ) {
    context.addIssue({
      code: 'custom',
      message: 'I-1: an UNSTATED claim must start HIDDEN',
      path: ['initial', 'presentation'],
    });
  }

  const startsLocked = claim.initial.presentation === 'LOCKED';
  if (startsLocked && claim.lock === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'a claim that starts LOCKED must declare unlock_conditions',
      path: ['lock'],
    });
  }

  if (claim.lock?.locked_at_start === true && !startsLocked) {
    context.addIssue({
      code: 'custom',
      message: 'locked_at_start requires initial.presentation to be LOCKED',
      path: ['initial', 'presentation'],
    });
  }
}

/** Public claim contract. The truth field intentionally does not exist here. */
export const PublicClaimSchema = PublicClaimBaseSchema.superRefine(validateLockInvariant);
export type PublicClaim = z.infer<typeof PublicClaimSchema>;

export const ClaimTruthSchema = z.strictObject({
  relation: TruthRelationSchema,
  contradicting_events: uniqueContentIds(),
});
export type ClaimTruth = z.infer<typeof ClaimTruthSchema>;

/** TruthGraph-owned content record. Never expose this type to UI or AI modules. */
export const TruthClaimSchema = PublicClaimBaseSchema.extend({
  truth: ClaimTruthSchema,
}).superRefine(validateLockInvariant);
export type TruthClaim = z.infer<typeof TruthClaimSchema>;

/** Compatibility projection consumed by the existing knowledge initializer. */
export const ClaimDefinitionSchema = z.strictObject({
  claimId: PublicClaimBaseSchema.shape.claim_id,
  speakerId: PublicClaimBaseSchema.shape.speaker,
  facet: PublicClaimBaseSchema.shape.facet,
  canonicalMeaning: PublicClaimBaseSchema.shape.canonical_meaning,
  isRequired: PublicClaimBaseSchema.shape.is_required,
});
export type ClaimDefinition = z.infer<typeof ClaimDefinitionSchema>;
