import type { PartnerCooldownView, PublicDTO, SuspectStatePart } from '../../../dto';
import type { CardAttachments } from '../../widgets/cardLayers';

export interface InterrogationCardView {
  readonly cardId: string;
  readonly title: string;
  readonly description: string;
  readonly intent: string;
  readonly cpCost: number;
  readonly requiresEvidence: boolean;
  readonly artAssetKey?: string;
  readonly attachments?: CardAttachments;
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
  readonly sweetSpotMin?: number;
  readonly sweetSpotMax?: number;
  readonly cards: readonly InterrogationCardView[];
  readonly selectedEvidenceIds?: readonly string[];
  readonly evidenceCosts?: Readonly<Record<string, number>>;
  readonly backgroundAssetKey?: string;
  readonly portraitBaseAssetKey?: string;
  /** One asset key per suspect state sheet; `base` may be omitted. */
  readonly portraitStatePartsAssetKeys?: Readonly<Partial<Record<SuspectStatePart, string>>>;
  readonly partnerBaseAssetKey?: string;
  readonly partnerUsedAssetKey?: string;
  readonly suspectStatePart: SuspectStatePart;
  readonly partnerCooldown: PartnerCooldownView;
  readonly partnerSkillAvailable: boolean;
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
  readonly onUsePartner?: () => void;
  readonly onKeystroke?: () => void;
  /** Raised when a card is dragged onto a tag chip and docked there. */
  readonly onCardDock?: (cardId: string, facet: InterrogationSelection['facet']) => void;
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
