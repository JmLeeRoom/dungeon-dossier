import { z } from 'zod';
import type { DialogueRequest, RenderableClaim } from '../dto';

export type ClaimFacet = RenderableClaim['facet'];
export type MissingScope = DialogueRequest['missingScopes'][number];
export type ComposureBand = 'HIGH' | 'MID' | 'LOW' | 'CRITICAL';

/** Explicit allow-list: arbitrary profile metadata cannot cross the AI boundary. */
export interface SpeakerProfile {
  readonly race: string;
  readonly personality: readonly string[];
  readonly speech: string;
  readonly forbidden_expressions: readonly string[];
}

export type AiRenderableClaim = RenderableClaim;

export interface PresentationGroup {
  readonly group_id: string;
  readonly claim_ids: readonly string[];
}

/**
 * Exact AI-facing statement contract. Truth, proof rules, hypotheses, and
 * resource values have no representable field here.
 */
export interface StatementRequest {
  readonly speaker_profile: SpeakerProfile;
  readonly allowed_claims: readonly AiRenderableClaim[];
  readonly presentation_groups: readonly PresentationGroup[];
  readonly forbidden_information: readonly string[];
  readonly seed: number;
}

export interface ReactionRequest extends StatementRequest {
  readonly reaction_key: string;
  readonly missing_scopes: readonly MissingScope[];
  readonly composure_band: ComposureBand;
}

export const DialogueTokenSchema = z.strictObject({
  token_id: z.string().trim().min(1),
  claim_ids: z.array(z.string().trim().min(1)).min(1),
  text: z.string().min(1),
  span_start: z.number().int().nonnegative(),
  span_end: z.number().int().positive(),
});
export type DialogueToken = z.infer<typeof DialogueTokenSchema>;

export const DialogueResponseSchema = z.strictObject({
  request_id: z.string().trim().min(1),
  full_text: z.string().min(1),
  tokens: z.array(DialogueTokenSchema),
  model_id: z.string().trim().min(1),
  seed: z.number().int().nonnegative(),
});

export type StatementResponse = z.infer<typeof DialogueResponseSchema>;
export type ReactionResponse = StatementResponse;
export type DialogueResponse = StatementResponse;

export interface DialogueProvider {
  renderStatement(request: StatementRequest): Promise<StatementResponse>;
  renderReaction(request: ReactionRequest): Promise<ReactionResponse>;
}

export type DialogueKind = 'statement' | 'reaction';

export class DialogueProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DialogueProviderError';
  }
}

export class DialogueTimeoutError extends DialogueProviderError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Dialogue provider timed out after ${timeoutMs.toString()}ms.`);
    this.name = 'DialogueTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
