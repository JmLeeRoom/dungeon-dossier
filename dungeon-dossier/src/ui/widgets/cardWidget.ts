import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { ASSET_DIMENSIONS } from '../core/assetDimensions';
import { containImage } from '../core/imageFit';
import { createPixelText } from '../core/pixelText';
import {
  buildCardLayerStack,
  createCardAttachments,
  type CardAttachments,
  type CardLayerId,
  type CardLayerSlot,
} from './cardLayers';
import {
  CARD_COPY_FONT_SIZES,
  CARD_COPY_RECTS,
  CARD_LAYER_RECTS,
  CARD_LOCK_Z_INDEX,
  CARD_SIZE,
  layoutCardEvidence,
} from './cardLayout';
import { UI_PALETTE } from './theme';

export const CARD_INTENT_COLOURS: Readonly<Record<string, number>> = {
  QUERY: UI_PALETTE.blue,
  CLARIFY: UI_PALETTE.blue,
  CONFIRM: UI_PALETTE.green,
  CONTRADICT: UI_PALETTE.red,
  PRESSURE: UI_PALETTE.amber,
  RECOVER: UI_PALETTE.green,
  FORENSIC: UI_PALETTE.cyan,
  SPECIAL: UI_PALETTE.amber,
  COMMIT: UI_PALETTE.red,
};

export interface CardFace {
  readonly title: string;
  readonly intent: string;
  readonly cpCost: number;
  readonly description?: string;
  readonly ordinal?: number;
  readonly roleLabel?: string;
  readonly warningLabels?: readonly string[];
  readonly affordable?: boolean;
  /** Rendered with the debuff overlay and, upstream, with input suppressed. */
  readonly locked?: boolean;
  readonly lockTurnsRemaining?: number;
}

export type CardLayerUrlResolver = (
  layer: CardLayerId,
  attachmentId: string | undefined,
) => string | undefined;

export interface CardWidgetOptions {
  readonly attachments?: CardAttachments;
  readonly resolveLayerUrl?: CardLayerUrlResolver;
  /** `ui/debuff/kiss`, resolved by the caller. Absent means no overlay art. */
  readonly lockOverlayUrl?: string;
}

export interface CardWidget {
  readonly view: Container;
  readonly stack: readonly CardLayerSlot[];
  /** Named permanent layers make the eight-layer contract inspectable. */
  readonly permanentLayers: Readonly<Partial<Record<CardLayerId, Container>>>;
}

function intentColour(intent: string): number {
  return CARD_INTENT_COLOURS[intent] ?? UI_PALETTE.panelLight;
}

/**
 * Decoration must never become a hit target. The card's clickable area is the
 * explicit `hitArea` on the root, so a bigger illustration or an extra polaroid
 * cannot silently change where a card can be grabbed.
 */
function decorative<T extends Container>(node: T): T {
  node.eventMode = 'none';
  return node;
}

function layerSprite(url: string, layer: CardLayerId): Sprite {
  const rect = CARD_LAYER_RECTS[layer];
  const view = Sprite.from(url);
  view.position.set(rect.x, rect.y);
  view.width = rect.width;
  view.height = rect.height;
  return decorative(view);
}

/** Approved CP coin and numeric value in the base art's upper COST slot. */
function drawCpBadge(cpCost: number, iconUrl: string | undefined, affordable = true): Container {
  const rect = CARD_COPY_RECTS.cpBadge;
  const badge = new Container();
  if (iconUrl !== undefined) {
    const icon = Sprite.from(iconUrl);
    icon.position.set(rect.x + 6, rect.y + 12);
    icon.width = 56;
    icon.height = 56;
    badge.addChild(icon);
  } else {
    badge.addChild(
      new Graphics()
        .circle(rect.x + 34, rect.y + 40, 27)
        .fill(affordable ? UI_PALETTE.amber : UI_PALETTE.panelLight)
        .stroke({ color: UI_PALETTE.deepInk, width: 4 }),
    );
  }
  const label = createPixelText(String(cpCost), {
    fontSize: CARD_COPY_FONT_SIZES.cpBadge,
    fill: affordable ? UI_PALETTE.ink : UI_PALETTE.panelLight,
  });
  label.anchor.set(0.5);
  label.position.set(rect.x + 78, rect.y + 40);
  badge.addChild(label);
  return decorative(badge);
}

const LEGACY_ROLE_LABELS: Readonly<Record<string, string>> = {
  QUERY: '질문',
  CLARIFY: '해명',
  CONFIRM: '사실 확인',
  CONTRADICT: '모순 지적',
  PRESSURE: '압박',
  RECOVER: '진정',
  FORENSIC: '과학 수사',
  SPECIAL: '특수',
  COMMIT: '확정',
};

function glyphWidthUnits(character: string): number {
  if (/\s/u.test(character)) return 0.38;
  return (character.codePointAt(0) ?? 0) <= 0x7f ? 0.62 : 1;
}

/** Deterministic pre-fit; the mask below remains the final overflow gate. */
export function fitCardText(
  text: string,
  rect: Readonly<{ width: number; height: number }>,
  maximumFontSize: number,
  minimumFontSize: number,
): Readonly<{ fontSize: number; lineHeight: number; lineCount: number }> {
  for (let fontSize = maximumFontSize; fontSize >= minimumFontSize; fontSize -= 2) {
    const capacity = rect.width / fontSize;
    let used = 0;
    let lines = 1;
    for (const character of Array.from(text)) {
      if (character === '\n') {
        lines += 1;
        used = 0;
        continue;
      }
      const width = glyphWidthUnits(character);
      if (used > 0 && used + width > capacity) {
        lines += 1;
        used = width;
      } else {
        used += width;
      }
    }
    const lineHeight = fontSize + 6;
    if (lines * lineHeight <= rect.height) return { fontSize, lineHeight, lineCount: lines };
  }
  const fontSize = minimumFontSize;
  const lineHeight = fontSize + 6;
  return {
    fontSize,
    lineHeight,
    lineCount: Math.max(1, Math.floor(rect.height / lineHeight)),
  };
}

function clippedTextLayer(text: Container, rect: Readonly<{ x: number; y: number; width: number; height: number }>): Container {
  const holder = new Container();
  const mask = new Graphics().rect(rect.x, rect.y, rect.width, rect.height).fill(0xffffff);
  holder.addChild(text, mask);
  holder.mask = mask;
  return decorative(holder);
}

/**
 * The description is part of the face, not a focus-modal extra: at fan scale
 * the authored 48px copy lands at exactly 9px, which is the size the hand is
 * meant to be read at.
 */
function drawDescription(description: string): Container {
  const rect = CARD_COPY_RECTS.description;
  const fit = fitCardText(description, rect, CARD_COPY_FONT_SIZES.description, 24);
  const body = createPixelText(description, {
    fontSize: fit.fontSize,
    fill: UI_PALETTE.ink,
    wordWrap: true,
    wordWrapWidth: rect.width,
    lineHeight: fit.lineHeight,
  });
  body.position.set(rect.x, rect.y);
  return clippedTextLayer(body, rect);
}

/**
 * Title, cost, ordinal, intent and body copy, composited as one independent
 * layer. It used to be a child of the base layer, which meant every raster
 * layer docked afterwards — seals, post-its, evidence polaroids — could cover
 * the text the player needs in order to choose the card.
 */
function drawNameLayer(face: CardFace): Container {
  const layer = new Container();
  const titleRect = CARD_COPY_RECTS.title;
  const fit = fitCardText(face.title, titleRect, CARD_COPY_FONT_SIZES.title, 30);
  const title = createPixelText(face.title, {
    fontSize: fit.fontSize,
    fill: UI_PALETTE.ink,
    wordWrap: true,
    wordWrapWidth: titleRect.width,
    align: 'center',
    lineHeight: fit.lineHeight,
  });
  title.anchor.set(0.5, 0);
  title.position.set(titleRect.x + titleRect.width / 2, titleRect.y);
  layer.addChild(clippedTextLayer(title, titleRect));

  if (face.ordinal !== undefined) {
    // The hand slot number sits opposite the cost badge so both stay readable.
    const rect = CARD_COPY_RECTS.ordinal;
    const ordinal = createPixelText(String(face.ordinal), {
      fontSize: CARD_COPY_FONT_SIZES.ordinal,
      fill: UI_PALETTE.parchmentDark,
    });
    ordinal.anchor.set(1, 0);
    ordinal.position.set(rect.x + rect.width, rect.y);
    layer.addChild(ordinal);
  }

  return decorative(layer);
}

function drawAbilityLayer(face: CardFace): Container {
  const layer = new Container();
  const intentRect = CARD_COPY_RECTS.intent;
  const roleLabel = face.roleLabel ?? LEGACY_ROLE_LABELS[face.intent] ?? face.intent;
  const intent = createPixelText(roleLabel, {
    fontSize: CARD_COPY_FONT_SIZES.intent,
    fill: intentColour(face.intent),
  });
  intent.position.set(intentRect.x, intentRect.y);
  layer.addChild(clippedTextLayer(intent, intentRect));

  if (face.description !== undefined && face.description !== '') {
    layer.addChild(drawDescription(face.description));
  }

  const warningText = face.warningLabels?.join(' · ');
  if (warningText !== undefined && warningText !== '') {
    const rect = CARD_COPY_RECTS.warning;
    const warning = createPixelText(warningText, {
      fontSize: CARD_COPY_FONT_SIZES.warning,
      fill: UI_PALETTE.red,
      wordWrap: true,
      wordWrapWidth: rect.width,
      lineHeight: rect.height,
    });
    warning.position.set(rect.x, rect.y);
    layer.addChild(clippedTextLayer(warning, rect));
  }

  return decorative(layer);
}

function drawBaseLayer(face: CardFace, url: string | undefined): Container {
  const layer = new Container();
  const rect = CARD_LAYER_RECTS.base;
  if (url === undefined) {
    layer.addChild(
      new Graphics()
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill(UI_PALETTE.panel)
        .stroke({ color: intentColour(face.intent), width: 14 })
        .rect(28, 28, rect.width - 56, rect.height - 56)
        .stroke({ color: UI_PALETTE.parchmentDark, width: 4 })
        // Plate behind the lower sheet so the copy keeps its contrast on cards
        // whose base art is missing.
        .rect(64, 520, 640, 448)
        .fill(UI_PALETTE.parchment),
    );
  } else {
    layer.addChild(layerSprite(url, 'base'));
  }
  return decorative(layer);
}

function drawIllustPlaceholder(face: CardFace): Graphics {
  const rect = CARD_LAYER_RECTS.illust;
  return decorative(
    new Graphics()
      .rect(rect.x, rect.y, rect.width, rect.height)
      .fill(UI_PALETTE.deepInk)
      .rect(rect.x + 10, rect.y + 10, rect.width - 20, rect.height - 20)
      .stroke({ color: intentColour(face.intent), width: 4 }),
  );
}

function drawStampPlaceholder(): Graphics {
  const rect = CARD_LAYER_RECTS.stamp;
  const radius = Math.min(rect.width, rect.height) / 2;
  return decorative(
    new Graphics()
      .circle(rect.x + rect.width / 2, rect.y + rect.height / 2, radius)
      .stroke({ color: UI_PALETTE.red, width: 8 })
      .circle(rect.x + rect.width / 2, rect.y + rect.height / 2, radius - 18)
      .stroke({ color: UI_PALETTE.red, width: 4 }),
  );
}

function drawPostPlaceholder(): Graphics {
  const rect = CARD_LAYER_RECTS.post;
  return decorative(
    new Graphics()
      .rect(rect.x, rect.y, rect.width, rect.height)
      .fill({ color: UI_PALETTE.green, alpha: 0.5 }),
  );
}

/**
 * One evidence polaroid at its fanned placement. The rotation is applied about
 * the polaroid's own centre so the tilt never walks the stack off the card.
 */
function drawEvidence(
  url: string | undefined,
  placement: { readonly x: number; readonly y: number; readonly rotation: number },
): Container {
  const rect = CARD_LAYER_RECTS.evidence;
  const holder = new Container();
  holder.pivot.set(rect.width / 2, rect.height / 2);
  holder.position.set(placement.x + rect.width / 2, placement.y + rect.height / 2);
  holder.rotation = placement.rotation;

  if (url === undefined) {
    holder.addChild(
      new Graphics()
        .rect(0, 0, rect.width, rect.height)
        .fill(UI_PALETTE.parchment)
        .stroke({ color: UI_PALETTE.amber, width: 6 }),
    );
  } else {
    const sprite = Sprite.from(url);
    sprite.width = rect.width;
    sprite.height = rect.height;
    holder.addChild(sprite);
  }
  return decorative(holder);
}

/**
 * The succubus lock. It is a card-local overlay driven by the snapshot's
 * `lockedUntilTurn`, not a HUD element and not a new engine state.
 */
function drawLockOverlay(face: CardFace, url: string | undefined): Container {
  const layer = new Container();
  layer.addChild(
    new Graphics()
      .rect(0, 0, CARD_SIZE.width, CARD_SIZE.height)
      .fill({ color: UI_PALETTE.deepInk, alpha: 0.55 }),
  );

  if (url !== undefined) {
    const rect = containImage(ASSET_DIMENSIONS.debuff_580, CARD_LAYER_RECTS.illust);
    const sprite = Sprite.from(url);
    sprite.position.set(rect.x, rect.y);
    sprite.width = rect.width;
    sprite.height = rect.height;
    layer.addChild(sprite);
  }

  if (face.lockTurnsRemaining !== undefined && face.lockTurnsRemaining > 0) {
    const turns = createPixelText(String(face.lockTurnsRemaining), {
      fontSize: 96,
      fill: UI_PALETTE.paper,
    });
    turns.anchor.set(0.5);
    turns.position.set(CARD_SIZE.width / 2, CARD_SIZE.height / 2);
    layer.addChild(turns);
  }
  return decorative(layer);
}

/**
 * Composites one card in its authored 768x1024 space. Callers scale the
 * returned container; nothing inside is laid out per display size, so the fan
 * and the focus modal share pixel-identical geometry.
 */
export function createCardWidget(face: CardFace, options: CardWidgetOptions = {}): CardWidget {
  const attachments = options.attachments ?? createCardAttachments();
  const stack = buildCardLayerStack(attachments);
  const view = new Container();
  view.sortableChildren = true;
  // The clickable region is the card rectangle and only the card rectangle.
  view.hitArea = new Rectangle(0, 0, CARD_SIZE.width, CARD_SIZE.height);

  const evidencePlacements = layoutCardEvidence(attachments.evidenceIds.length);
  let evidenceOrdinal = 0;
  const permanentLayers: Partial<Record<CardLayerId, Container>> = {};

  for (const slot of stack) {
    const url = options.resolveLayerUrl?.(slot.layer, slot.attachmentId);
    let child: Container;
    if (slot.layer === 'evidence') {
      const placement = evidencePlacements[evidenceOrdinal];
      evidenceOrdinal += 1;
      // Past `maxVisible` there is no placement: the polaroid is dropped
      // rather than stacked off the card edge.
      if (placement === undefined) continue;
      child = drawEvidence(url, placement);
    } else if (slot.layer === 'base') {
      child = drawBaseLayer(face, url);
    } else if (slot.layer === 'cost') {
      child = drawCpBadge(face.cpCost, url, face.affordable !== false);
    } else if (slot.layer === 'name') {
      child = drawNameLayer(face);
    } else if (slot.layer === 'ability') {
      child = drawAbilityLayer(face);
    } else if (url !== undefined) {
      child = layerSprite(url, slot.layer);
    } else if (slot.layer === 'illust') {
      child = drawIllustPlaceholder(face);
    } else if (slot.layer === 'stamp') {
      child = drawStampPlaceholder();
    } else {
      child = drawPostPlaceholder();
    }
    child.zIndex = slot.zIndex;
    if (slot.attachmentId === undefined && slot.layer !== 'evidence') {
      permanentLayers[slot.layer] = child;
    }
    view.addChild(child);
  }

  if (face.locked === true) {
    const lock = drawLockOverlay(face, options.lockOverlayUrl);
    lock.zIndex = CARD_LOCK_Z_INDEX;
    view.addChild(lock);
  }

  return { view, stack, permanentLayers };
}
