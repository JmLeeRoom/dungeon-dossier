import { ASSET_DIMENSIONS } from '../core/assetDimensions';
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

/** Authored card size. Every layer rect below is in this card-local space. */
export const CARD_SIZE = ASSET_DIMENSIONS.card_base;

const ILLUST = ASSET_DIMENSIONS.card_illust;
const EVIDENCE = ASSET_DIMENSIONS.evidence;

/** Outer padding shared by the copy zones and the right-aligned illustration. */
const CARD_MARGIN = 40;

export const CARD_LAYER_RECTS: Readonly<Record<CardLayerId, CardLayerRect>> = {
  base: { x: 0, y: 0, width: CARD_SIZE.width, height: CARD_SIZE.height },
  // Right-aligned so the left column can own the intent label without the two
  // ever overlapping at fan scale.
  illust: {
    x: CARD_SIZE.width - ILLUST.width - CARD_MARGIN,
    y: 176,
    width: ILLUST.width,
    height: ILLUST.height,
  },
  // Left column, under the intent label and beside the illustration. It used
  // to sit bottom-right, which is now the permanent description block.
  stamp: { x: CARD_MARGIN, y: 240, width: 192, height: 192 },
  post: { x: 0, y: 0, width: CARD_SIZE.width, height: CARD_SIZE.height },
  evidence: {
    x: (CARD_SIZE.width - EVIDENCE.width) / 2,
    y: 16,
    width: EVIDENCE.width,
    height: EVIDENCE.height,
  },
};

export type CardCopyZoneId = 'cpBadge' | 'ordinal' | 'title' | 'intent' | 'description';

/**
 * The three fixed reading zones of a card face, in the same authored 640x725
 * space as CARD_LAYER_RECTS: cost badge top-left, illustration right, and a
 * permanent description block across the bottom.
 */
export const CARD_COPY_RECTS: Readonly<Record<CardCopyZoneId, CardLayerRect>> = {
  cpBadge: { x: CARD_MARGIN, y: 44, width: 88, height: 56 },
  ordinal: { x: CARD_SIZE.width - CARD_MARGIN - 48, y: 44, width: 48, height: 44 },
  title: { x: 140, y: 44, width: 460, height: 96 },
  intent: { x: CARD_MARGIN, y: 192, width: 264, height: 44 },
  description: { x: CARD_MARGIN, y: 470, width: 560, height: 215 },
};

/**
 * Authored sizes, not display sizes. The hand renders a card at
 * CARD_FAN_SCALE, so 40 here is the 8px the interrogation screen shows.
 */
export const CARD_COPY_FONT_SIZES = {
  title: 40,
  cpBadge: 35,
  ordinal: 35,
  intent: 30,
  description: 40,
} as const;

export const CARD_COPY_LINE_HEIGHTS = {
  title: 44,
  description: 46,
} as const;

/** Cards render at a fifth of their authored size inside the 640x400 grid. */
export const CARD_FAN_SCALE = 0.2;

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

export interface CardHandSlot {
  readonly index: number;
  readonly x: number;
  readonly restY: number;
  readonly hoverY: number;
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
  const stageWidth = options.stageWidth ?? 640;
  const panelBottom = options.panelBottom ?? 400;
  const cardWidth = options.cardWidth ?? CARD_FAN_WIDTH;
  const cardHeight = options.cardHeight ?? CARD_FAN_HEIGHT;
  const spacing = options.spacing ?? Math.round(cardWidth * 0.84);
  const restY = panelBottom - cardRevealHeight(CARD_REST_REVEAL_RATIO, cardHeight);
  const hoverY = panelBottom - cardRevealHeight(CARD_HOVER_REVEAL_RATIO, cardHeight);
  const span = count === 0 ? 0 : (count - 1) * spacing + cardWidth;
  const startX = Math.round((stageWidth - span) / 2);
  const centre = (count - 1) / 2;

  return Array.from({ length: count }, (_, index) => ({
    index,
    x: startX + index * spacing,
    restY,
    hoverY,
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
 * The focus modal always composites the card at its authored 640x725 and then
 * fits that frame into the stage, so no layer is ever laid out at a rounded-off
 * size.
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
  // Authored card pixels are already HD pixels. A 0.5 scale in the internal
  // 640x400 grid becomes exactly 640x725 after the root stage's 2x upscale.
  const logicalStageScale = Math.min(
    stageWidth / INTERNAL_WIDTH,
    stageHeight / INTERNAL_HEIGHT,
  );
  const sourcePixelScale = Math.min(1, logicalStageScale / DEFAULT_TARGET_SCALE);
  const scale = Math.min(fitScale, sourcePixelScale);
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
