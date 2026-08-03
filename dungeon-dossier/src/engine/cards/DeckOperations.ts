import type { ContentId } from '../domain';

export interface DeckState {
  readonly drawPile: readonly ContentId[];
  readonly hand: readonly ContentId[];
  readonly discardPile: readonly ContentId[];
}

export interface DealInitialHandResult {
  readonly deck: DeckState;
  readonly dealtCardIds: readonly ContentId[];
}

export interface DiscardHandResult {
  readonly deck: DeckState;
  readonly discardedCardIds: readonly ContentId[];
}

function assertCardCount(name: string, count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
}

/** Deals from the top of an already ordered/shuffled draw pile. */
export function dealInitialHand(
  deck: DeckState,
  count: number,
): DealInitialHandResult {
  assertCardCount('Initial hand count', count);
  const drawPile = [...deck.drawPile];
  const dealtCardIds = drawPile.splice(0, count);
  return {
    deck: {
      drawPile,
      hand: [...deck.hand, ...dealtCardIds],
      discardPile: [...deck.discardPile],
    },
    dealtCardIds,
  };
}

/** Moves one physical copy from hand to discard. Duplicate card IDs are valid. */
export function playCard(deck: DeckState, cardId: ContentId): DeckState {
  const hand = [...deck.hand];
  const cardIndex = hand.indexOf(cardId);
  if (cardIndex < 0) {
    throw new Error(`Card ${cardId} is not in hand.`);
  }
  hand.splice(cardIndex, 1);
  return {
    drawPile: [...deck.drawPile],
    hand,
    discardPile: [...deck.discardPile, cardId],
  };
}

/** Ends a hand without losing duplicate copies or changing draw-pile order. */
export function discardHand(deck: DeckState): DiscardHandResult {
  const discardedCardIds = [...deck.hand];
  return {
    deck: {
      drawPile: [...deck.drawPile],
      hand: [],
      discardPile: [...deck.discardPile, ...discardedCardIds],
    },
    discardedCardIds,
  };
}
