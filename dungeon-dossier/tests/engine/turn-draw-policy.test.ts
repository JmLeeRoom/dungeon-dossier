import { describe, expect, it } from 'vitest';

import {
  createTurnDrawPolicy,
  drawSlotsFromBlueprints,
  drawTurnHandWithReplacement,
  assertV2TurnBoundaryModifiers,
  type EncounterModifier,
} from '../../src/engine/encounter';
import { createRngState } from '../../src/engine/rng';

const BLUEPRINTS = ['card-a', 'card-b', 'card-c', 'card-d', 'card-e'] as const;

function policy() {
  return createTurnDrawPolicy(
    drawSlotsFromBlueprints(BLUEPRINTS),
    new Set(BLUEPRINTS),
  );
}

describe('P0-4 five-slot with-replacement draw', () => {
  it('requires exactly five persistent slots with unique slot ids', () => {
    expect(() => drawSlotsFromBlueprints(BLUEPRINTS.slice(0, 4))).toThrow(
      'exactly 5',
    );
    expect(() => createTurnDrawPolicy([
      { slotId: 'same', blueprintId: 'card-a' },
      { slotId: 'same', blueprintId: 'card-b' },
      { slotId: '3', blueprintId: 'card-c' },
      { slotId: '4', blueprintId: 'card-d' },
      { slotId: '5', blueprintId: 'card-e' },
    ], new Set(BLUEPRINTS))).toThrow('slot ids must be unique');
    expect(() => createTurnDrawPolicy([
      ...drawSlotsFromBlueprints(BLUEPRINTS).slice(0, 4),
      { slotId: 'basic-5', blueprintId: 'card-unknown' },
    ], new Set(BLUEPRINTS))).toThrow('unknown blueprint');
  });

  it('consumes exactly five CARD_DRAW steps and reproduces duplicate results', () => {
    const initial = createRngState(0, 'CARD_DRAW');
    const first = drawTurnHandWithReplacement(policy(), initial, 0);
    const replay = drawTurnHandWithReplacement(policy(), initial, 0);

    expect(first).toEqual(replay);
    expect(first.blueprintIds).toEqual([
      'card-d',
      'card-b',
      'card-c',
      'card-e',
      'card-c',
    ]);
    expect(first.blueprintIds).toHaveLength(5);
    expect(new Set(first.blueprintIds).size).toBeLessThan(5);
    expect(first.cursor).toBe(5);

    const second = drawTurnHandWithReplacement(
      policy(),
      first.rngState,
      first.cursor,
    );
    expect(second.cursor).toBe(10);
  });

  it('never produces a blueprint outside the five current slots', () => {
    const current = policy();
    const allowed = new Set(BLUEPRINTS);
    let rng = createRngState(12345, 'CARD_DRAW');
    let cursor = 0;
    for (let turn = 0; turn < 1_000; turn += 1) {
      const draw = drawTurnHandWithReplacement(current, rng, cursor);
      expect(draw.blueprintIds).toHaveLength(5);
      expect(draw.blueprintIds.every((id) => allowed.has(id as typeof BLUEPRINTS[number])))
        .toBe(true);
      rng = draw.rngState;
      cursor = draw.cursor;
    }
    expect(cursor).toBe(5_000);
  });
});

function modifier(
  trigger: EncounterModifier['trigger'],
  type: EncounterModifier['effect']['type'],
  scope?: string,
): EncounterModifier {
  return {
    modifier_id: `mod-${trigger}-${type}`,
    trigger,
    condition: null,
    effect: {
      type,
      ...(scope === undefined ? {} : { target_selector: { scope } }),
    },
    counterplay: {
      allowed_intents: [],
      partner_skills: [],
      always_available: true,
    },
    activation_limit: 1,
    priority: 1,
  };
}

describe('P0-4 turn-boundary semantic gate', () => {
  it('rejects draw/discard/hand selectors before draw', () => {
    expect(() => assertV2TurnBoundaryModifiers([
      modifier('ON_TURN_START_PRE_DRAW', 'DRAW_CARD'),
    ])).toThrow('hand-dependent pre-draw');
    expect(() => assertV2TurnBoundaryModifiers([
      modifier('ON_TURN_START_PRE_DRAW', 'DISCARD_CARD'),
    ])).toThrow('hand-dependent pre-draw');
    expect(() => assertV2TurnBoundaryModifiers([
      modifier('ON_TURN_START_PRE_DRAW', 'SEAL_EVIDENCE', 'HAND'),
    ])).toThrow('hand-dependent pre-draw');
  });

  it('allows only the migrated LOCK_CARD effect after the five-card hand exists', () => {
    expect(() => assertV2TurnBoundaryModifiers([
      modifier('ON_HAND_READY', 'LOCK_CARD', 'HAND'),
    ])).not.toThrow();
    expect(() => assertV2TurnBoundaryModifiers([
      modifier('ON_HAND_READY', 'APPLY_COERCION'),
    ])).toThrow('may only LOCK_CARD');
  });
});
