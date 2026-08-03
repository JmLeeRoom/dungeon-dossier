import type { PublicDTO } from '../../../dto';

export interface InterrogationCardView {
  readonly cardId: string;
  readonly title: string;
  readonly description: string;
  readonly intent: string;
  readonly cpCost: number;
  readonly requiresEvidence: boolean;
  readonly artAssetKey?: string;
}

export interface InterrogationTurnView {
  readonly current: number;
  readonly limit: number;
}

/**
 * Presentation-only values that are not part of the engine's public knowledge
 * projection. The UI still receives the game state exclusively through
 * PublicDTO; these values are labels, limits, and current input affordances.
 */
export interface InterrogationScreenModel {
  readonly dto: PublicDTO;
  readonly suspectName: string;
  readonly partnerName: string;
  readonly turn: InterrogationTurnView;
  readonly stress: number;
  readonly composureMax: number;
  readonly coercionMax: number;
  readonly sweetSpotUnlocked: boolean;
  readonly cards: readonly InterrogationCardView[];
  readonly selectedEvidenceIds?: readonly string[];
  readonly evidenceCosts?: Readonly<Record<string, number>>;
  readonly portraitBaseAssetKey?: string;
  readonly portraitPartsAssetKey?: string;
  readonly partnerAssetKey?: string;
  readonly canSecureStatement?: boolean;
}

export interface InterrogationSelection {
  readonly cardId?: string;
  readonly facet?: PublicDTO['statement'][number]['facet'];
  readonly evidenceIds: readonly string[];
}

export interface InterrogationCallbacks {
  readonly onSelectionChange?: (selection: InterrogationSelection) => void;
  readonly onSubmit?: (selection: InterrogationSelection) => void;
  readonly onAdvance?: () => void;
  readonly onSecureStatement?: () => void;
  readonly onKeystroke?: () => void;
}

export interface InterrogationAssetLookup {
  resolveUrl(key: string): string | undefined;
}

export function cardNeedsEvidence(
  cards: readonly InterrogationCardView[],
  cardId: string | undefined,
): boolean {
  return cards.find((card) => card.cardId === cardId)?.requiresEvidence ?? false;
}

export function canSubmitInterrogationSelection(
  cards: readonly InterrogationCardView[],
  selection: InterrogationSelection,
): boolean {
  if (selection.cardId === undefined || selection.facet === undefined) return false;
  const card = cards.find((candidate) => candidate.cardId === selection.cardId);
  if (card === undefined) return false;
  return !card.requiresEvidence || selection.evidenceIds.length > 0;
}
