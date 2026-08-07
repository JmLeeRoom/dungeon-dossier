import { Container, Graphics, Sprite } from 'pixi.js';
import {
  buildCardLayerStack,
  createCardAttachments,
  type CardAttachments,
  type CardLayerId,
  type CardLayerSlot,
} from './cardLayers';
import { createPixelText } from '../core/pixelText';
import {
  CARD_COPY_FONT_SIZES,
  CARD_COPY_LINE_HEIGHTS,
  CARD_COPY_RECTS,
  CARD_LAYER_RECTS,
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

export interface CardArtworkFace {
  readonly title: string;
  readonly intent: string;
  readonly cpCost: number;
  readonly description?: string;
  readonly ordinal?: number;
}

export type CardLayerUrlResolver = (
  layer: CardLayerId,
  attachmentId: string | undefined,
) => string | undefined;

export interface CardArtworkOptions {
  readonly attachments?: CardAttachments;
  readonly resolveLayerUrl?: CardLayerUrlResolver;
}

export interface CardArtwork {
  readonly view: Container;
  readonly stack: readonly CardLayerSlot[];
}

function intentColour(intent: string): number {
  return CARD_INTENT_COLOURS[intent] ?? UI_PALETTE.panelLight;
}

/** Top-left cost chip. The badge plate keeps it legible over any base art. */
function drawCpBadge(cpCost: number): Container {
  const rect = CARD_COPY_RECTS.cpBadge;
  const badge = new Container();
  badge.addChild(
    new Graphics()
      .roundRect(rect.x, rect.y, rect.width, rect.height, 10)
      .fill(UI_PALETTE.deepInk)
      .roundRect(rect.x, rect.y, rect.width, rect.height, 10)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 4 }),
  );
  const label = createPixelText(`${cpCost} CP`, {
    fontSize: CARD_COPY_FONT_SIZES.cpBadge,
    fill: UI_PALETTE.paper,
  });
  label.anchor.set(0.5);
  label.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
  badge.addChild(label);
  return badge;
}

/**
 * The description is part of the face, not a focus-modal extra: at fan scale
 * the authored 40px copy lands at exactly 8px, which is the size the hand is
 * meant to be read at.
 */
function drawDescription(description: string): Container {
  const rect = CARD_COPY_RECTS.description;
  const body = createPixelText(description, {
    fontSize: CARD_COPY_FONT_SIZES.description,
    fill: UI_PALETTE.parchment,
    wordWrap: true,
    wordWrapWidth: rect.width,
    lineHeight: CARD_COPY_LINE_HEIGHTS.description,
  });
  body.position.set(rect.x, rect.y);
  return body;
}

function drawCardCopy(face: CardArtworkFace): Container {
  const layer = new Container();
  const titleRect = CARD_COPY_RECTS.title;
  const title = createPixelText(face.title, {
    fontSize: CARD_COPY_FONT_SIZES.title,
    fill: UI_PALETTE.paper,
    wordWrap: true,
    wordWrapWidth: titleRect.width,
    align: 'center',
    lineHeight: CARD_COPY_LINE_HEIGHTS.title,
  });
  title.anchor.set(0.5, 0);
  title.position.set(titleRect.x + titleRect.width / 2, titleRect.y);
  layer.addChild(title);

  layer.addChild(drawCpBadge(face.cpCost));

  if (face.ordinal !== undefined) {
    // The hand slot number moved opposite the cost badge so both stay readable.
    const rect = CARD_COPY_RECTS.ordinal;
    const ordinal = createPixelText(String(face.ordinal), {
      fontSize: CARD_COPY_FONT_SIZES.ordinal,
      fill: UI_PALETTE.parchment,
    });
    ordinal.anchor.set(1, 0);
    ordinal.position.set(rect.x + rect.width, rect.y);
    layer.addChild(ordinal);
  }

  const intentRect = CARD_COPY_RECTS.intent;
  const intent = createPixelText(face.intent, {
    fontSize: CARD_COPY_FONT_SIZES.intent,
    fill: UI_PALETTE.muted,
  });
  intent.position.set(intentRect.x, intentRect.y);
  layer.addChild(intent);

  if (face.description !== undefined && face.description !== '') {
    layer.addChild(drawDescription(face.description));
  }

  return layer;
}

function drawBaseLayer(face: CardArtworkFace, url: string | undefined): Container {
  const layer = new Container();
  const rect = CARD_LAYER_RECTS.base;
  if (url === undefined) {
    layer.addChild(
      new Graphics()
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill(UI_PALETTE.panel)
        .stroke({ color: intentColour(face.intent), width: 12 })
        .rect(24, 24, rect.width - 48, rect.height - 48)
        .stroke({ color: UI_PALETTE.parchmentDark, width: 4 })
        .rect(24, 24, rect.width - 48, 96)
        .fill(intentColour(face.intent))
        // Plate behind the permanent description block so the body copy keeps
        // its contrast on cards whose base art is missing.
        .rect(
          CARD_COPY_RECTS.description.x - 16,
          CARD_COPY_RECTS.description.y - 14,
          CARD_COPY_RECTS.description.width + 32,
          CARD_COPY_RECTS.description.height + 20,
        )
        .fill(UI_PALETTE.deepInk),
    );
  } else {
    layer.addChild(sprite(url, 'base'));
  }
  layer.addChild(drawCardCopy(face));
  return layer;
}

function drawIllustPlaceholder(face: CardArtworkFace): Graphics {
  const rect = CARD_LAYER_RECTS.illust;
  return new Graphics()
    .rect(rect.x, rect.y, rect.width, rect.height)
    .fill(UI_PALETTE.deepInk)
    .rect(rect.x + 8, rect.y + 8, rect.width - 16, rect.height - 16)
    .stroke({ color: intentColour(face.intent), width: 3 });
}

function drawStampPlaceholder(): Graphics {
  const rect = CARD_LAYER_RECTS.stamp;
  return new Graphics()
    .circle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2)
    .stroke({ color: UI_PALETTE.red, width: 8 })
    .circle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2 - 18)
    .stroke({ color: UI_PALETTE.red, width: 4 });
}

function drawPostPlaceholder(): Graphics {
  const rect = CARD_LAYER_RECTS.post;
  return new Graphics()
    .rect(rect.x, rect.y, rect.width, rect.height)
    .fill({ color: UI_PALETTE.cyan, alpha: 0.14 });
}

function drawEvidencePlaceholder(offsetX: number): Container {
  const rect = CARD_LAYER_RECTS.evidence;
  const layer = new Container();
  layer.addChild(
    new Graphics()
      .rect(rect.x + offsetX, rect.y, rect.width, rect.height)
      .fill(UI_PALETTE.parchment)
      .stroke({ color: UI_PALETTE.amber, width: 6 }),
  );
  return layer;
}

function sprite(url: string, layer: CardLayerId, offsetX = 0): Sprite {
  const rect = CARD_LAYER_RECTS[layer];
  const view = Sprite.from(url);
  view.position.set(rect.x + offsetX, rect.y);
  view.width = rect.width;
  view.height = rect.height;
  return view;
}

/**
 * Composites one card in its authored 640x725 space. Callers scale the returned
 * container; nothing inside is laid out per display size, so the fan and the
 * focus modal share pixel-identical geometry.
 */
export function createCardArtwork(
  face: CardArtworkFace,
  options: CardArtworkOptions = {},
): CardArtwork {
  const attachments = options.attachments ?? createCardAttachments();
  const stack = buildCardLayerStack(attachments);
  const view = new Container();
  view.sortableChildren = true;

  let evidenceOrdinal = 0;
  const evidenceCount = attachments.evidenceIds.length;

  for (const slot of stack) {
    const url = options.resolveLayerUrl?.(slot.layer, slot.attachmentId);
    let child: Container;
    if (slot.layer === 'evidence') {
      const spread = (evidenceOrdinal - (evidenceCount - 1) / 2) * (CARD_LAYER_RECTS.evidence.width + 24);
      evidenceOrdinal += 1;
      child = url === undefined
        ? drawEvidencePlaceholder(spread)
        : sprite(url, 'evidence', spread);
    } else if (slot.layer === 'base') {
      child = drawBaseLayer(face, url);
    } else if (url !== undefined) {
      child = sprite(url, slot.layer);
    } else if (slot.layer === 'illust') {
      child = drawIllustPlaceholder(face);
    } else if (slot.layer === 'stamp') {
      child = drawStampPlaceholder();
    } else {
      child = drawPostPlaceholder();
    }
    child.zIndex = slot.zIndex;
    view.addChild(child);
  }

  return { view, stack };
}
