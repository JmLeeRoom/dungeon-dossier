import { describe, expect, it } from 'vitest';
import { resolveEncounterResources } from '../../src/content-io';
import type { BalanceDefinition } from '../../src/engine/domain';

function balanceWithOverride(): BalanceDefinition {
  return {
    schema_version: '1.0',
    draw: { initial: 5, perTurn: 1, handLimit: 7, reshuffleOnEmpty: true },
    stress: { max: 100 },
    dp: { initial: 0, rewardBattle: 20 },
    dmg: { contradict: 18, pressure: 8, requery: 4, chainPursuit: 12 },
    shield: { durabilityDefault: 1 },
    composureDmg: { indirect: 4 },
    coercion: {
      insufficient: 2,
      truthAttack: 15,
      irrelevant: 5,
      redStampFactor: 1.5,
      goblinReflectFactor: 2,
      breathReduce: 4,
      finalConfirmReduce: 3,
    },
    committedMultiplier: 1.4,
    independence: { partialWeight: 0.5 },
    partner: { cooldowns: {} },
    trust: { max: 3, thresholds: [1, 2] },
    composure: { regen: {} },
    overrides: {
      byEncounter: {
        enc_boss: { composureMax: 140, cpMax: 5 },
      },
    },
    sweetSpot: { min: 1, max: 30 },
  };
}

const CASE_RESOURCES = {
  composure_max: 80,
  cp_per_turn: 3,
  cp_max: 3,
  coercion_limit: 100,
  shields_per_round: 1,
} as const;

describe('encounter balance override priority', () => {
  it('lets a matching balance override win over overlapping case data', () => {
    expect(resolveEncounterResources(balanceWithOverride(), 'enc_boss', CASE_RESOURCES)).toEqual({
      ...CASE_RESOURCES,
      composure_max: 140,
      cp_max: 5,
    });
  });

  it('returns a detached copy when no override is present', () => {
    const resolved = resolveEncounterResources(balanceWithOverride(), 'enc_regular', CASE_RESOURCES);
    expect(resolved).toEqual(CASE_RESOURCES);
    expect(resolved).not.toBe(CASE_RESOURCES);
  });
});
