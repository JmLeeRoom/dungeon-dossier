import type { PartnerCooldownView, PublicDTO, SuspectStatePart } from '../../../dto';
import type { AssetResolveContext } from '../../core/uiAssetPort';
import type { CardAttachments } from '../../widgets/cardLayers';
import type { SuspectAssetSet } from '../../widgets/suspectPortraitWidget';

export const CARD_TARGET_RULES = [
  'GAP_OR_SHIELD_ATTEMPT',
  'GAP_OR_BROKEN',
  'BROKEN',
  'ANY_CLAIM',
] as const;
export type CardTargetRule = (typeof CARD_TARGET_RULES)[number];

export const CARD_EVIDENCE_MODES = ['NONE', 'OPTIONAL_FOR_SHIELD', 'EXACTLY_ONE'] as const;
export type CardEvidenceMode = (typeof CARD_EVIDENCE_MODES)[number];

export type ClaimExposure = 'GAP' | 'SHIELDED' | 'BROKEN';

export interface InterrogationCardCombatView {
  readonly roleLabel: string;
  readonly targetRule: CardTargetRule;
  readonly evidenceMode: CardEvidenceMode;
}

export interface InterrogationCardView {
  readonly cardId: string;
  /**
   * v2 turn loop: the physical copy's identity. Selection callbacks echo the
   * definition id today, but the app resolves the submitted instance through
   * this field so duplicate blueprints stay unambiguous.
   */
  readonly instanceId?: string;
  readonly title: string;
  readonly description: string;
  readonly intent: string;
  readonly cpCost: number;
  readonly requiresEvidence: boolean;
  /** Current-frame affordability; absent keeps legacy fixtures playable. */
  readonly affordable?: boolean;
  readonly minEvidence?: number;
  readonly maxEvidence?: number;
  readonly combat?: InterrogationCardCombatView;
  /** Player-facing warnings such as HOT_TEMPER_RISK. */
  readonly warningLabels?: readonly string[];
  /** Approved active/deactive CP coin selected by the app projection. */
  readonly costIconAssetKey?: string;
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
  /** CP capacity, so spent points render as empty coins rather than vanishing. */
  readonly commandPointsMax?: number;
  /** Run HP capacity, shown as `HP current/max`. */
  readonly hpMax?: number;
  readonly sweetSpotUnlocked: boolean;
  readonly sweetSpotMin?: number;
  readonly sweetSpotMax?: number;
  readonly cards: readonly InterrogationCardView[];
  /** Exposure of each active claim in this exact presentation frame. */
  readonly claimExposureByFacet?: Readonly<Partial<Record<PublicDTO['statement'][number]['facet'], ClaimExposure>>>;
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
  /**
   * v2 secure-decision checkpoint, projected verbatim from the engine's
   * pending decision — the screen never recomputes eligibility. While
   * present, the inline decision rail owns all input.
   */
  readonly pendingDecision?: InterrogationDecisionView;
}

export interface InterrogationDecisionView {
  readonly decisionId: string;
  readonly title: string;
  readonly secureLabel: string;
  readonly continueLabel: string;
}

export interface InterrogationSelection {
  readonly cardId?: string;
  /** V2 physical copy identity. Duplicate blueprints must never collapse. */
  readonly instanceId?: string;
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
  readonly onCardDock?: (
    cardId: string,
    facet: InterrogationSelection['facet'],
    instanceId?: string,
  ) => void;
  /** v2 decision rail: the player chose Secure or Continue for this decision. */
  readonly onResolveDecision?: (
    decisionId: string,
    choice: 'SECURE' | 'CONTINUE',
  ) => void;
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
  exposure?: ClaimExposure,
): boolean {
  if (card === undefined) return true;
  if (card.allowedFacets !== undefined && !card.allowedFacets.includes(facet)) return false;
  const rule = card.combat?.targetRule;
  if (rule === undefined || rule === 'ANY_CLAIM') return true;
  if (exposure === undefined) return false;
  if (rule === 'GAP_OR_SHIELD_ATTEMPT') return exposure === 'GAP' || exposure === 'SHIELDED';
  if (rule === 'GAP_OR_BROKEN') return exposure === 'GAP' || exposure === 'BROKEN';
  return exposure === 'BROKEN';
}

/** Stable per-slot UI key; V2 uses the canonical physical instance id. */
export function interrogationCardKey(
  card: InterrogationCardView,
  index: number,
): string {
  return card.instanceId ?? `legacy:${index}:${card.cardId}`;
}

export function selectedInterrogationCard(
  cards: readonly InterrogationCardView[],
  selection: Pick<InterrogationSelection, 'cardId' | 'instanceId'>,
): InterrogationCardView | undefined {
  if (selection.cardId === undefined) return undefined;
  if (selection.instanceId === undefined) {
    return cards.find((candidate) => candidate.cardId === selection.cardId);
  }
  return cards.find(
    (candidate) =>
      candidate.cardId === selection.cardId &&
      candidate.instanceId === selection.instanceId,
  );
}

export function cardEvidenceRange(
  card: InterrogationCardView,
  exposure?: ClaimExposure,
): Readonly<{ min: number; max: number }> {
  if (card.combat?.evidenceMode === 'NONE') return { min: 0, max: 0 };
  if (card.combat?.evidenceMode === 'EXACTLY_ONE') return { min: 1, max: 1 };
  if (card.combat?.evidenceMode === 'OPTIONAL_FOR_SHIELD') {
    return exposure === 'SHIELDED' ? { min: 1, max: 1 } : { min: 0, max: 0 };
  }
  const min = card.minEvidence ?? (card.requiresEvidence ? 1 : 0);
  return { min, max: card.maxEvidence ?? Number.POSITIVE_INFINITY };
}

export function canSubmitInterrogationSelection(
  cards: readonly InterrogationCardView[],
  selection: InterrogationSelection,
  claimExposureByFacet: InterrogationScreenModel['claimExposureByFacet'] = {},
): boolean {
  if (selection.cardId === undefined || selection.facet === undefined) return false;
  const card = selectedInterrogationCard(cards, selection);
  if (card === undefined) return false;
  if (card.locked === true) return false;
  if (card.affordable === false) return false;
  const exposure = claimExposureByFacet?.[selection.facet];
  if (!interrogationCardAllowsFacet(card, selection.facet, exposure)) return false;
  const range = cardEvidenceRange(card, exposure);
  return selection.evidenceIds.length >= range.min && selection.evidenceIds.length <= range.max;
}
