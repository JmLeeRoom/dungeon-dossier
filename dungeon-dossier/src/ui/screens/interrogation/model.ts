import type { PartnerCooldownView, PublicDTO, SuspectStatePart } from '../../../dto';
import type { AssetResolveContext } from '../../core/uiAssetPort';
import type { CardAttachments } from '../../widgets/cardLayers';
import type { SuspectAssetSet } from '../../widgets/suspectPortraitWidget';

export interface InterrogationCardView {
  readonly cardId: string;
  readonly title: string;
  readonly description: string;
  readonly intent: string;
  readonly cpCost: number;
  readonly requiresEvidence: boolean;
  /** Undefined means the authored target accepts every public facet. */
  readonly allowedFacets?: readonly PublicDTO['statement'][number]['facet'][];
  readonly artAssetKey?: string;
  readonly attachments?: CardAttachments;
  /**
   * Derived from the snapshot's `cards[cardId].lockedUntilTurn`; it is a
   * projection of existing engine state, not a new one. A locked card renders
   * its debuff overlay and refuses every pointer path.
   */
  readonly locked?: boolean;
  readonly lockTurnsRemaining?: number;
  readonly debuffAssetKey?: string;
}

export interface InterrogationTurnView {
  readonly current: number;
  readonly limit: number;
}

export const JUDGMENT_FEEDBACK_TONES = [
  'CONTRADICTION',
  'SUPPORT',
  'MISS',
  'INVALID',
] as const;
export type JudgmentFeedbackTone = (typeof JUDGMENT_FEEDBACK_TONES)[number];

/**
 * Fully localized judgment copy. The app layer owns every string-key lookup so
 * the screen only ever receives display text.
 */
export interface JudgmentFeedbackView {
  readonly tone: JudgmentFeedbackTone;
  readonly headline: string;
  readonly statementQuote: string;
  readonly evidenceQuote: string;
  readonly detail: string;
  /** The assembled single-line banner copy. */
  readonly text: string;
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
  /**
   * The suspect's three frames plus how they composite. Approved art replaces
   * the whole frame; generated placeholders overlay a difference layer.
   */
  readonly suspectAssetSet?: SuspectAssetSet;
  readonly partnerBaseAssetKey?: string;
  readonly partnerUsedAssetKey?: string;
  /** Authored evidence id to polaroid key, resolved by the app layer. */
  readonly evidenceAssetKeys?: Readonly<Record<string, string>>;
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
  /** Falls back to the placeholder plate when a required key is absent. */
  resolveUrl(key: string): string | undefined;
  /** Exact lookup with no fallback; missing decorative art stays invisible. */
  resolveOptionalUrl?(key: string): string | undefined;
  /** Exact required lookup used by production scene bindings. */
  resolveRequiredUrl?(key: string, context: AssetResolveContext): string;
}

export function cardNeedsEvidence(
  cards: readonly InterrogationCardView[],
  cardId: string | undefined,
): boolean {
  return cards.find((card) => card.cardId === cardId)?.requiresEvidence ?? false;
}

export function interrogationCardAllowsFacet(
  card: InterrogationCardView | undefined,
  facet: PublicDTO['statement'][number]['facet'],
): boolean {
  return card?.allowedFacets === undefined || card.allowedFacets.includes(facet);
}

export function canSubmitInterrogationSelection(
  cards: readonly InterrogationCardView[],
  selection: InterrogationSelection,
): boolean {
  if (selection.cardId === undefined || selection.facet === undefined) return false;
  const card = cards.find((candidate) => candidate.cardId === selection.cardId);
  if (card === undefined) return false;
  if (card.locked === true) return false;
  if (!interrogationCardAllowsFacet(card, selection.facet)) return false;
  return !card.requiresEvidence || selection.evidenceIds.length > 0;
}
