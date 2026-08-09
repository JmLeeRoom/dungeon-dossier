import type { ContentId } from '../domain';
import { nextRandom, type RngState } from '../rng';

export const TURN_HAND_SIZE = 5 as const;

export interface BasicDrawSlot {
  readonly slotId: string;
  readonly blueprintId: ContentId;
}

export type BasicDrawSlots = readonly [
  BasicDrawSlot,
  BasicDrawSlot,
  BasicDrawSlot,
  BasicDrawSlot,
  BasicDrawSlot,
];

export interface TurnDrawPolicy {
  readonly handSize: typeof TURN_HAND_SIZE;
  readonly slots: BasicDrawSlots;
  readonly mode: 'WITH_REPLACEMENT';
  readonly discardRemainingOnValidSubmit: true;
  readonly rngStream: 'CARD_DRAW';
}

export interface WithReplacementDrawResult {
  readonly blueprintIds: readonly ContentId[];
  readonly rngState: RngState;
  readonly cursor: number;
}

function assertNonEmpty(name: string, value: string): void {
  if (value.length === 0) throw new Error(`${name} must be non-empty.`);
}

/** Five persistent ownership/weight slots; duplicate blueprints are legal. */
export function createTurnDrawPolicy(
  slots: readonly BasicDrawSlot[],
  knownBlueprintIds?: ReadonlySet<ContentId>,
): TurnDrawPolicy {
  if (slots.length !== TURN_HAND_SIZE) {
    throw new Error(`Turn draw policy requires exactly ${TURN_HAND_SIZE} slots.`);
  }
  const copied = slots.map((slot) => {
    assertNonEmpty('draw slot id', slot.slotId);
    assertNonEmpty('draw slot blueprint id', slot.blueprintId);
    if (knownBlueprintIds !== undefined && !knownBlueprintIds.has(slot.blueprintId)) {
      throw new Error(`Draw slot ${slot.slotId} references unknown blueprint ${slot.blueprintId}.`);
    }
    return Object.freeze({ ...slot });
  });
  if (new Set(copied.map((slot) => slot.slotId)).size !== TURN_HAND_SIZE) {
    throw new Error('Turn draw slot ids must be unique.');
  }
  return Object.freeze({
    handSize: TURN_HAND_SIZE,
    slots: Object.freeze(copied) as unknown as BasicDrawSlots,
    mode: 'WITH_REPLACEMENT',
    discardRemainingOnValidSubmit: true,
    rngStream: 'CARD_DRAW',
  });
}

/** Exactly five CARD_DRAW steps; every pick is independent (replacement). */
export function drawTurnHandWithReplacement(
  policy: TurnDrawPolicy,
  initialRngState: RngState,
  initialCursor: number,
): WithReplacementDrawResult {
  if (!Number.isSafeInteger(initialCursor) || initialCursor < 0) {
    throw new Error('CARD_DRAW cursor must be a non-negative safe integer.');
  }
  let rngState = initialRngState;
  const blueprintIds: ContentId[] = [];
  for (let index = 0; index < policy.handSize; index += 1) {
    const step = nextRandom(rngState);
    rngState = step.state;
    const slotIndex = Math.floor(step.value * policy.slots.length);
    blueprintIds.push(policy.slots[slotIndex]!.blueprintId);
  }
  return Object.freeze({
    blueprintIds: Object.freeze(blueprintIds),
    rngState: Object.freeze({ ...rngState }),
    cursor: initialCursor + policy.handSize,
  });
}

/** New-run compatibility adapter until blueprint/module ownership lands in P3. */
export function drawSlotsFromBlueprints(
  blueprintIds: readonly ContentId[],
): BasicDrawSlots {
  if (blueprintIds.length !== TURN_HAND_SIZE) {
    throw new Error(`A new run requires exactly ${TURN_HAND_SIZE} draw blueprints.`);
  }
  return Object.freeze(
    blueprintIds.map((blueprintId, index) => Object.freeze({
      slotId: `basic-${index + 1}`,
      blueprintId,
    })),
  ) as unknown as BasicDrawSlots;
}
