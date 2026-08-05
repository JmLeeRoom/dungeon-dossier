import { Container, Graphics, Sprite } from 'pixi.js';
import {
  buildCardLayerStack,
  createCardAttachments,
  type CardAttachments,
  type CardLayerId,
  type CardLayerSlot,
} from './cardLayers';
import { createPixelText } from '../core/pixelText';
import { CARD_LAYER_RECTS, CARD_SIZE } from './cardLayout';
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
  /** Draws the body copy that only fits in the full-size focus modal. */
  readonly detailed?: boolean;
}

export interface CardArtwork {
  readonly view: Container;
  readonly stack: readonly CardLayerSlot[];
}

function intentColour(intent: string): number {
  return CARD_INTENT_COLOURS[intent] ?? UI_PALETTE.panelLight;
}

function drawCardCopy(face: CardArtworkFace): Container {
  const layer = new Container();
  const rect = CARD_LAYER_RECTS.base;
  const title = createPixelText(face.title, {
    fontSize: 40,
    fill: UI_PALETTE.paper,
    wordWrap: true,
    wordWrapWidth: rect.width - 140,
    align: 'center',
    lineHeight: 44,
  });
  title.anchor.set(0.5, 0);
  title.position.set(rect.width / 2, 44);
  layer.addChild(title);

  if (face.ordinal !== undefined) {
    const ordinal = createPixelText(String(face.ordinal), {
      fontSize: 35,
      fill: UI_PALETTE.paper,
    });
    ordinal.position.set(40, 44);
    layer.addChild(ordinal);
  }

  const cost = createPixelText(`${face.cpCost} CP`, {
    fontSize: 35,
    fill: UI_PALETTE.parchment,
  });
  cost.anchor.set(1, 1);
  cost.position.set(rect.width - 40, rect.height - 40);
  layer.addChild(cost);

  const intent = createPixelText(face.intent, { fontSize: 30, fill: UI_PALETTE.muted });
  intent.position.set(40, rect.height - 76);
  layer.addChild(intent);

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
        .rect(24, rect.height - 120, rect.width - 48, 96)
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

function drawDescription(face: CardArtworkFace): Container | undefined {
  if (face.description === undefined) return undefined;
  const body = createPixelText(face.description, {
    fontSize: 30,
    fill: UI_PALETTE.parchment,
    wordWrap: true,
    wordWrapWidth: CARD_SIZE.width - 120,
    lineHeight: 38,
  });
  body.anchor.set(0.5, 0);
  body.position.set(CARD_SIZE.width / 2, 470);
  return body;
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
      if (options.detailed === true) {
        const description = drawDescription(face);
        if (description !== undefined) child.addChild(description);
      }
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
