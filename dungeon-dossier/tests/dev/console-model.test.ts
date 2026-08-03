import { describe, expect, it } from 'vitest';
import {
  BALANCE_SECTIONS,
  DEV_FLAG_IDS,
  clampRuntimeResource,
  parseBalanceFieldValue,
  readPath,
  writePath,
} from '../../src/dev/console/model';

describe('developer console model', () => {
  it('exposes the complete balance catalogue', () => {
    const paths = BALANCE_SECTIONS.flatMap((section) => section.fields.map((field) => field.path));
    expect(paths).toEqual([
      'draw.initial',
      'draw.perTurn',
      'draw.handLimit',
      'draw.reshuffleOnEmpty',
      'dmg.contradict',
      'dmg.pressure',
      'dmg.requery',
      'dmg.chainPursuit',
      'composureDmg.indirect',
      'shield.durabilityDefault',
      'committedMultiplier',
      'coercion.insufficient',
      'coercion.truthAttack',
      'coercion.irrelevant',
      'coercion.redStampFactor',
      'coercion.goblinReflectFactor',
      'coercion.breathReduce',
      'coercion.finalConfirmReduce',
      'independence.partialWeight',
      'sweetSpot.min',
      'sweetSpot.max',
      'stress.max',
      'dp.initial',
      'dp.rewardBattle',
      'trust.max',
      'trust.thresholds',
      'partner.cooldowns',
      'composure.regen',
      'overrides.byEncounter',
    ]);
  });

  it('edits nested draft paths and parses each control kind', () => {
    const draft = { draw: { initial: 5, reshuffleOnEmpty: true }, trust: { thresholds: [1, 2] } };
    writePath(draft, 'draw.initial', parseBalanceFieldValue('number', '6'));
    writePath(draft, 'draw.reshuffleOnEmpty', parseBalanceFieldValue('boolean', '', false));
    writePath(draft, 'trust.thresholds', parseBalanceFieldValue('json', '[2, 3]'));
    expect(readPath(draft, 'draw.initial')).toBe(6);
    expect(readPath(draft, 'draw.reshuffleOnEmpty')).toBe(false);
    expect(readPath(draft, 'trust.thresholds')).toEqual([2, 3]);
  });

  it('provides all 13 canonical flags and clamps resource cheats', () => {
    expect(DEV_FLAG_IDS).toEqual([
      'F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06', 'F-07',
      'F-08', 'F-09', 'F-10', 'F-11', 'F-12', 'F-13',
    ]);
    expect(clampRuntimeResource('coercion', 120)).toBe(100);
    expect(clampRuntimeResource('stress', -4)).toBe(0);
    expect(clampRuntimeResource('composure', 120)).toBe(120);
    expect(clampRuntimeResource('commandPoints', -1)).toBe(0);
  });
});
