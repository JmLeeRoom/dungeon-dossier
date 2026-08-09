import { ASSET_DIMENSIONS } from '../core/assetDimensions';
import { containImage, fitImage, type FitBox } from '../core/imageFit';
import {
  DEFAULT_TARGET_SCALE,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from '../core/integerScale';
import { CARD_LAYER_Z_INDEX, type CardLayerId } from './cardLayers';

export interface CardLayerRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The canonical card canvas: the authored size of `ui_card_base.png`. Every
 * rect below is in this card-local space, and the hand and the focus modal
 * scale the whole composite rather than laying anything out per display size.
 *
 * 768x1024 is 0.750; the superseded generated plate was 640x725 (0.883). They
 * are not a scale of one another, which is why this is a different dimension id
 * rather than a changed value.
 */
export const CARD_SIZE = ASSET_DIMENSIONS.card_base_768x1024;

const ILLUST = ASSET_DIMENSIONS.card_illust;
const EVIDENCE = ASSET_DIMENSIONS.card_evidence_256;
const POST = ASSET_DIMENSIONS.card_post_675x312;
const BADGE = ASSET_DIMENSIONS.card_badge_344x176;

/** Outer padding shared by the copy zones and the illustration. */
export const CARD_MARGIN = 48;

/**
 * The base art is a dossier folder holding two sheets: an aged upper leaf that
 * reads as the photograph mount, and a lighter loose sheet below it that reads
 * as the typed report. Art goes in the first, copy in the second — the layout
 * follows the painting rather than dividing the rectangle arbitrarily.
 */
export const CARD_ART_ZONE: FitBox = { x: 56, y: 48, width: 656, height: 440 };
export const CARD_SHEET_ZONE: FitBox = { x: 64, y: 520, width: 640, height: 448 };

/** Attachment zones, resolved aspect-true so no overlay is ever stretched. */
// The illustration is the one layer allowed to grow: it is the subject of the
// card and the mount is sized for it. Every card is composited once and then
// scaled down by the hand or the modal, so the enlargement never survives to
// the screen as a sampled-up edge.
const ILLUST_RECT = fitImage(ILLUST, CARD_ART_ZONE, { allowUpscale: true });
const POST_RECT = containImage(POST, { x: 32, y: 40, width: 432, height: 200 });
const STAMP_RECT = containImage(BADGE, { x: 368, y: 312, width: BADGE.width, height: BADGE.height });
const EVIDENCE_RECT = containImage(EVIDENCE, { x: 284, y: 16, width: 200, height: 200 });

export const CARD_LAYER_RECTS: Readonly<Record<CardLayerId, CardLayerRect>> = {
  base: { x: 0, y: 0, width: CARD_SIZE.width, height: CARD_SIZE.height },
  // The approved coin occupies the value slot immediately under the baked-in
  // COST heading. Copy never borrows the lower EFFECT sheet for its price.
  cost: { x: 64, y: 100, width: 96, height: 96 },
  name: { x: 96, y: 538, width: 568, height: 76 },
  ability: { x: 96, y: 650, width: 576, height: 224 },
  // Centred on the photograph mount at the largest aspect-true size it holds.
  illust: { x: ILLUST_RECT.x, y: ILLUST_RECT.y, width: ILLUST_RECT.width, height: ILLUST_RECT.height },
  // The attribute seal is pressed across the lower-right of the photograph, at
  // its authored 344x176 — a seal that has been resized reads as a sticker.
  stamp: { x: STAMP_RECT.x, y: STAMP_RECT.y, width: STAMP_RECT.width, height: STAMP_RECT.height },
  // The post-it is an addition to the file, so it sits over the mount's top
  // corner rather than covering the whole card the way the old flat tint did.
  post: { x: POST_RECT.x, y: POST_RECT.y, width: POST_RECT.width, height: POST_RECT.height },
  evidence: {
    x: EVIDENCE_RECT.x,
    y: EVIDENCE_RECT.y,
    width: EVIDENCE_RECT.width,
    height: EVIDENCE_RECT.height,
  },
};

/**
 * Evidence polaroids are clipped to the card, not to the count: three at this
 * pitch span 108..660, which is inside 0..768 with room for the rotation.
 */
export const CARD_EVIDENCE_LAYOUT = {
  maxVisible: 3,
  /** Horizontal distance between neighbouring polaroid centres. */
  pitch: 176,
  /** Alternating tilt, in radians, so a stack reads as loose photographs. */
  rotationStep: 0.06,
} as const;

export interface CardEvidencePlacement {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

/**
 * Fans `count` polaroids around the card centre. Returns one placement per
 * visible item; anything past `maxVisible` is dropped rather than allowed to
 * run off the card edge.
 */
export function layoutCardEvidence(count: number): readonly CardEvidencePlacement[] {
  const visible = Math.min(
    Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)),
    CARD_EVIDENCE_LAYOUT.maxVisible,
  );
  const centre = (visible - 1) / 2;
  return Array.from({ length: visible }, (_, index) => ({
    x: CARD_LAYER_RECTS.evidence.x + Math.round((index - centre) * CARD_EVIDENCE_LAYOUT.pitch),
    y: CARD_LAYER_RECTS.evidence.y,
    rotation: Number(((index - centre) * CARD_EVIDENCE_LAYOUT.rotationStep).toFixed(4)),
  }));
}

export type CardCopyZoneId =
  | 'cpBadge'
  | 'ordinal'
  | 'title'
  | 'intent'
  | 'description'
  | 'warning';

/**
 * Reading zones follow the authored form: cost belongs to the upper COST
 * column; name and ability copy stay above the lower sheet's signature line.
 */
export const CARD_COPY_RECTS: Readonly<Record<CardCopyZoneId, CardLayerRect>> = {
  cpBadge: CARD_LAYER_RECTS.cost,
  ordinal: { x: CARD_SIZE.width - 96 - 50, y: 548, width: 50, height: 48 },
  title: { x: 104, y: 542, width: 448, height: 66 },
  intent: { x: 104, y: 654, width: 560, height: 40 },
  description: { x: 104, y: 702, width: 560, height: 136 },
  warning: { x: 104, y: 842, width: 560, height: 32 },
};

/**
 * Authored sizes, not display sizes. The hand renders a card at
 * CARD_FAN_SCALE, so 48 here is the 9px the interrogation screen shows.
 */
export const CARD_COPY_FONT_SIZES = {
  title: 48,
  cpBadge: 48,
  ordinal: 48,
  intent: 32,
  description: 42,
  warning: 26,
} as const;

export const CARD_COPY_LINE_HEIGHTS = {
  title: 54,
  description: 48,
} as const;

/**
 * 3/16. Chosen so a card lands on exactly 144x192 in the 640x400 grid: five of
 * them fit the stage width with the authored fan pitch, and both dimensions
 * stay whole numbers so the reveal heights and hit areas do too.
 */
export const CARD_FAN_SCALE = 0.1875;

/** Authored copy size as it actually lands on the 640x400 stage. */
export function cardCopyDisplayFontSize(
  authoredFontSize: number,
  scale: number = CARD_FAN_SCALE,
): number {
  return authoredFontSize * scale;
}

/** Lines of description that fit the fixed block before it overflows. */
export function cardDescriptionLineCapacity(
  lineHeight: number = CARD_COPY_LINE_HEIGHTS.description,
): number {
  return Math.max(0, Math.floor(CARD_COPY_RECTS.description.height / lineHeight));
}

export const CARD_FAN_WIDTH = CARD_SIZE.width * CARD_FAN_SCALE;
export const CARD_FAN_HEIGHT = CARD_SIZE.height * CARD_FAN_SCALE;

export const CARD_REST_REVEAL_RATIO = 0.2;
export const CARD_HOVER_REVEAL_RATIO = 0.4;
export const CARD_SELECTED_REVEAL_RATIO = 1;

export interface CardHandSlot {
  readonly index: number;
  readonly x: number;
  readonly restY: number;
  readonly hoverY: number;
  readonly selectedY: number;
  readonly rotation: number;
}

export interface CardHandLayoutOptions {
  readonly stageWidth?: number;
  readonly panelBottom?: number;
  readonly cardWidth?: number;
  readonly cardHeight?: number;
  readonly spacing?: number;
}

/** Height of card actually visible above the panel edge at a reveal ratio. */
export function cardRevealHeight(ratio: number, cardHeight: number = CARD_FAN_HEIGHT): number {
  const clamped = Math.min(Math.max(Number.isFinite(ratio) ? ratio : 0, 0), 1);
  return Math.round(cardHeight * clamped);
}

/**
 * Cards hang off the bottom of the screen showing only their top 20%, and lift
 * to 40% while hovered. Only the y offset changes, so a hover never reflows the
 * hand.
 */
export function layoutCardHand(
  cardCount: number,
  options: CardHandLayoutOptions = {},
): readonly CardHandSlot[] {
  const count = Math.max(0, Math.floor(Number.isFinite(cardCount) ? cardCount : 0));
  const stageWidth = options.stageWidth ?? INTERNAL_WIDTH;
  const panelBottom = options.panelBottom ?? INTERNAL_HEIGHT;
  const cardWidth = options.cardWidth ?? CARD_FAN_WIDTH;
  const cardHeight = options.cardHeight ?? CARD_FAN_HEIGHT;
  const spacing = options.spacing ?? Math.round(cardWidth * 0.84);
  const restY = panelBottom - cardRevealHeight(CARD_REST_REVEAL_RATIO, cardHeight);
  const hoverY = panelBottom - cardRevealHeight(CARD_HOVER_REVEAL_RATIO, cardHeight);
  const selectedY = panelBottom - cardRevealHeight(CARD_SELECTED_REVEAL_RATIO, cardHeight);
  const span = count === 0 ? 0 : (count - 1) * spacing + cardWidth;
  const startX = Math.round((stageWidth - span) / 2);
  const centre = (count - 1) / 2;

  return Array.from({ length: count }, (_, index) => ({
    index,
    x: startX + index * spacing,
    restY,
    hoverY,
    selectedY,
    rotation: Number(((index - centre) * 0.02).toFixed(4)),
  }));
}

export interface CardModalLayout {
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The focus frame, in HD source pixels. The card is contained inside it rather
 * than filling it, so the 768x1024 canvas reaches this box's full height and
 * keeps its ratio.
 */
export const CARD_MODAL_BOX = { width: 640, height: 725 } as const;

/**
 * The focus modal composites the card at its authored 768x1024 and then fits
 * that frame into the smaller of the stage and the 640x725 focus box, so no
 * layer is ever laid out at a rounded-off size.
 */
export function computeCardModalLayout(
  stageWidth: number,
  stageHeight: number,
  margin = 8,
): CardModalLayout {
  const available = {
    width: Math.max(1, stageWidth - margin * 2),
    height: Math.max(1, stageHeight - margin * 2),
  };
  const fitScale = Math.min(
    available.width / CARD_SIZE.width,
    available.height / CARD_SIZE.height,
  );
  // Authored card pixels are HD pixels. A logical stage drawn at the 2x target
  // renders one card pixel per HD pixel, so anything below that has to shrink
  // by the same amount to stay on the texel grid.
  const logicalStageScale = Math.min(
    stageWidth / INTERNAL_WIDTH,
    stageHeight / INTERNAL_HEIGHT,
  );
  const sourcePixelScale = Math.min(1, logicalStageScale / DEFAULT_TARGET_SCALE);
  const boxScale =
    Math.min(
      CARD_MODAL_BOX.width / CARD_SIZE.width,
      CARD_MODAL_BOX.height / CARD_SIZE.height,
    ) * sourcePixelScale;
  const scale = Math.min(fitScale, boxScale);
  const width = CARD_SIZE.width * scale;
  const height = CARD_SIZE.height * scale;
  const pixelStep = sourcePixelScale > 0 ? sourcePixelScale : 1;
  const x = Math.round(((stageWidth - width) / 2) / pixelStep) * pixelStep;
  const y = Math.round(((stageHeight - height) / 2) / pixelStep) * pixelStep;
  return {
    nativeWidth: CARD_SIZE.width,
    nativeHeight: CARD_SIZE.height,
    scale,
    width,
    height,
    x,
    y,
  };
}

export function cardLayerZIndex(layer: CardLayerId): number {
  return CARD_LAYER_Z_INDEX[layer];
}

/** The lock is the first state overlay above the authored eight-layer face. */
export const CARD_LOCK_Z_INDEX = 8;

export interface CardDropTargetBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CardDropTarget {
  readonly id: string;
  readonly bounds: CardDropTargetBounds;
}

export interface CardPoint {
  readonly x: number;
  readonly y: number;
}

/** Last registered target wins so overlapping chips resolve to the topmost one. */
export function findCardDropTarget(
  point: CardPoint,
  targets: readonly CardDropTarget[],
): CardDropTarget | undefined {
  return targets.findLast(
    (target) =>
      point.x >= target.bounds.x &&
      point.x <= target.bounds.x + target.bounds.width &&
      point.y >= target.bounds.y &&
      point.y <= target.bounds.y + target.bounds.height,
  );
}
