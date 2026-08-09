export interface RngState {
  readonly value: number;
}

export interface RandomStep {
  readonly value: number;
  readonly state: RngState;
}

export type RngPurpose =
  | 'DECK_SHUFFLE'
  | 'CARD_DRAW'
  | 'MODIFIER_SELECTION'
  | 'AI_SEED';

function hashPurpose(purpose: RngPurpose): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < purpose.length; index += 1) {
    hash ^= purpose.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRngState(runSeed: number, purpose: RngPurpose): RngState {
  return { value: (runSeed ^ hashPurpose(purpose)) >>> 0 };
}

/** Pure mulberry32 step. State is explicit and serializable. */
export function nextRandom(state: RngState): RandomStep {
  const nextState = (state.value + 0x6d2b79f5) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const result = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { value: result, state: { value: nextState } };
}

export function shuffleWithState<T>(
  values: readonly T[],
  initialState: RngState,
): Readonly<{ values: readonly T[]; state: RngState }> {
  const shuffled = [...values];
  let state = initialState;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const step = nextRandom(state);
    state = step.state;
    const target = Math.floor(step.value * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target] as T, shuffled[index] as T];
  }

  return { values: shuffled, state };
}
