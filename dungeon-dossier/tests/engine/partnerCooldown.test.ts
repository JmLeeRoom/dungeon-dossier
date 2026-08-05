import { describe, expect, it } from 'vitest';
import {
  PARTNER_STATES,
  READY_PARTNER_STATE,
  advancePartnerCooldown,
  createPartnerCooldownState,
  isPartnerReady,
  partnerCooldownLabel,
  usePartnerSkill,
} from '../../src/engine/partnerState';

describe('partner cooldown', () => {
  it('starts ready in the base state', () => {
    expect(PARTNER_STATES).toEqual(['base', 'used']);
    expect(createPartnerCooldownState()).toEqual({ state: 'base', cooldownTurns: 0 });
    expect(READY_PARTNER_STATE).toEqual({ state: 'base', cooldownTurns: 0 });
    expect(isPartnerReady(createPartnerCooldownState())).toBe(true);
    expect(partnerCooldownLabel(createPartnerCooldownState())).toBeUndefined();
  });

  it('parks the ability in used for the requested turns', () => {
    const used = usePartnerSkill(createPartnerCooldownState(), 3);
    expect(used).toEqual({ state: 'used', cooldownTurns: 3 });
    expect(isPartnerReady(used)).toBe(false);
    expect(partnerCooldownLabel(used)).toBe('3');
  });

  it('ignores a second activation while still on cooldown', () => {
    const used = usePartnerSkill(createPartnerCooldownState(), 2);
    expect(usePartnerSkill(used, 5)).toBe(used);
  });

  it('counts down one turn at a time and re-arms automatically at zero', () => {
    let partner = usePartnerSkill(createPartnerCooldownState(), 3);
    partner = advancePartnerCooldown(partner);
    expect(partner).toEqual({ state: 'used', cooldownTurns: 2 });
    partner = advancePartnerCooldown(partner);
    expect(partner).toEqual({ state: 'used', cooldownTurns: 1 });
    expect(isPartnerReady(partner)).toBe(false);

    partner = advancePartnerCooldown(partner);
    expect(partner).toEqual({ state: 'base', cooldownTurns: 0 });
    expect(isPartnerReady(partner)).toBe(true);
    expect(partnerCooldownLabel(partner)).toBeUndefined();
    expect(usePartnerSkill(partner, 1)).toEqual({ state: 'used', cooldownTurns: 1 });
  });

  it('treats a ready partner and non-finite input as no-ops', () => {
    expect(advancePartnerCooldown(createPartnerCooldownState())).toEqual(READY_PARTNER_STATE);
    expect(usePartnerSkill(createPartnerCooldownState(), 0)).toEqual(READY_PARTNER_STATE);
    expect(usePartnerSkill(createPartnerCooldownState(), -4)).toEqual(READY_PARTNER_STATE);
    expect(usePartnerSkill(createPartnerCooldownState(), Number.NaN)).toEqual(READY_PARTNER_STATE);
    expect(usePartnerSkill(createPartnerCooldownState(), 2.9)).toEqual({
      state: 'used',
      cooldownTurns: 2,
    });
  });
});
