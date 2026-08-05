export const PARTNER_STATES = ['base', 'used'] as const;
export type PartnerState = (typeof PARTNER_STATES)[number];

export interface PartnerCooldownState {
  readonly state: PartnerState;
  readonly cooldownTurns: number;
}

export const READY_PARTNER_STATE: PartnerCooldownState = Object.freeze({
  state: 'base',
  cooldownTurns: 0,
});

function wholeTurns(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function createPartnerCooldownState(): PartnerCooldownState {
  return { ...READY_PARTNER_STATE };
}

export function isPartnerReady(state: PartnerCooldownState): boolean {
  return state.state === 'base' && state.cooldownTurns <= 0;
}

/**
 * Spending the skill parks the partner in `used` for the requested turns. A
 * zero-turn cooldown is not an error: the ability simply stays available.
 */
export function usePartnerSkill(
  state: PartnerCooldownState,
  cooldownTurns: number,
): PartnerCooldownState {
  if (!isPartnerReady(state)) return state;
  const turns = wholeTurns(cooldownTurns);
  return turns === 0 ? createPartnerCooldownState() : { state: 'used', cooldownTurns: turns };
}

/** One player turn of recovery; reaching zero re-arms the ability automatically. */
export function advancePartnerCooldown(state: PartnerCooldownState): PartnerCooldownState {
  if (state.state === 'base') return createPartnerCooldownState();
  const remaining = wholeTurns(state.cooldownTurns) - 1;
  return remaining <= 0 ? createPartnerCooldownState() : { state: 'used', cooldownTurns: remaining };
}

export function partnerCooldownLabel(state: PartnerCooldownState): string | undefined {
  return isPartnerReady(state) ? undefined : String(wholeTurns(state.cooldownTurns));
}
