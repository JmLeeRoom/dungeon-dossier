import type { ActionIntent, ContentId } from '../domain';

export interface CardDefinition {
  readonly cardId: ContentId;
  readonly intent: ActionIntent;
  readonly displayName: string;
}

export interface DeckState {
  readonly drawPile: readonly ContentId[];
  readonly hand: readonly ContentId[];
  readonly discardPile: readonly ContentId[];
}

