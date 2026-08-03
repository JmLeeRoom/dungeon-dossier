import { z } from 'zod';

/**
 * Stable vocabulary shared by content definitions and the headless engine.
 * Zod enums are the canonical definitions; constants and TypeScript types are
 * derived from them so validation and compile-time vocabulary cannot drift.
 */
export const FacetSchema = z.enum(['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY']);
export const FACETS = FacetSchema.options;
export type Facet = z.infer<typeof FacetSchema>;

export const ProofScopeSchema = z.enum([
  'IDENTITY',
  'TIME',
  'LOCATION',
  'PRESENCE',
  'OWNERSHIP',
  'ACTION',
  'SEQUENCE',
  'ROUTE',
  'INSTRUCTION',
  'MOTIVE',
  'INTEGRITY',
]);
export const PROOF_SCOPES = ProofScopeSchema.options;
export type ProofScope = z.infer<typeof ProofScopeSchema>;

/** Evidence originality grade. This never represents whether evidence is true. */
export const GradeSchema = z.enum(['A', 'B', 'C']);
export const GRADES = GradeSchema.options;
export type Grade = z.infer<typeof GradeSchema>;

export const ActionIntentSchema = z.enum([
  'QUERY',
  'CLARIFY',
  'CONFIRM',
  'CONTRADICT',
  'RECOVER',
  'PRESSURE',
  'FORENSIC',
  'SPECIAL',
  'COMMIT',
  'CROSS_CHECK',
]);
export const ACTION_INTENTS = ActionIntentSchema.options;
export type ActionIntent = z.infer<typeof ActionIntentSchema>;

export const CommitmentStateSchema = z.enum([
  'UNSTATED',
  'ASSERTED',
  'COMMITTED',
  'REVISED',
  'RETRACTED',
  'CONTRADICTED',
]);
export const COMMITMENT_STATES = CommitmentStateSchema.options;
export type CommitmentState = z.infer<typeof CommitmentStateSchema>;

export const EpistemicStateSchema = z.enum([
  'UNKNOWN',
  'SUSPECTED',
  'PROVISIONAL',
  'SUPPORTED',
  'REFUTED',
  'UNRESOLVED',
]);
export const EPISTEMIC_STATES = EpistemicStateSchema.options;
export type EpistemicState = z.infer<typeof EpistemicStateSchema>;

export const PresentationStateSchema = z.enum([
  'NORMAL',
  'COMPOUND',
  'DISTORTED',
  'HIDDEN',
  'LOCKED',
  'DUPLICATED',
]);
export const PRESENTATION_STATES = PresentationStateSchema.options;
export type PresentationState = z.infer<typeof PresentationStateSchema>;

export const TruthRelationSchema = z.enum([
  'CONSISTENT_WITH_WORLD',
  'CONTRADICTED_BY_WORLD',
  'PARTIALLY_TRUE',
  'UNVERIFIABLE',
  'IRRELEVANT',
]);
export const TRUTH_RELATIONS = TruthRelationSchema.options;
export type TruthRelation = z.infer<typeof TruthRelationSchema>;

export const SourceCategorySchema = z.enum([
  'PHYSICAL',
  'DIGITAL',
  'TESTIMONY',
  'FINANCIAL',
  'DOCUMENT',
]);
export const SOURCE_CATEGORIES = SourceCategorySchema.options;
export type SourceCategory = z.infer<typeof SourceCategorySchema>;

export const ResolutionCodeSchema = z.enum([
  'R_DIRECT_CONTRADICTION',
  'R_INDIRECT_SUSPICION',
  'R_INSUFFICIENT_GROUNDS',
  'R_TRUTH_ATTACKED',
  'R_IRRELEVANT_EVIDENCE',
  'R_CONFIRM_LOCKED',
  'R_CONFIRM_PROVISIONAL',
  'R_CONFIRM_CONFLICT',
  'R_QUERY_SUCCESS',
  'R_QUERY_BLOCKED',
  'R_CLARIFY_SUCCESS',
  'R_CLARIFY_NOOP',
  'R_COMMIT_SUCCESS',
  'R_COMMIT_REFUSED',
  'R_FORENSIC_REVEALED',
  'R_PRESSURE_APPLIED',
  'R_PRESSURE_BACKFIRE',
  'R_RECOVER_APPLIED',
  'R_SPECIAL_APPLIED',
  'R_ACTION_INVALID',
  'R_PROCEDURE_VIOLATION',
]);
export const RESOLUTION_CODES = ResolutionCodeSchema.options;
export type ResolutionCode = z.infer<typeof ResolutionCodeSchema>;

export const ContentIdSchema = z.string().trim().min(1).max(160);
export type ContentId = z.infer<typeof ContentIdSchema>;
