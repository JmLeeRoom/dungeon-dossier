/**
 * Presentation-owned character state contracts. These deliberately mirror
 * only the small, allow-listed values the UI can render; engine evaluators and
 * mutation helpers are never re-exported through the DTO boundary.
 */
export const SUSPECT_STATE_PARTS = ['base', 'upset', 'lose'] as const;
export type SuspectStatePart = (typeof SUSPECT_STATE_PARTS)[number];

export const PARTNER_STATES = ['base', 'used'] as const;
export type PartnerState = (typeof PARTNER_STATES)[number];

export interface PartnerCooldownView {
  readonly state: PartnerState;
  readonly cooldownTurns: number;
}
