import { Container, Graphics, Rectangle } from 'pixi.js';
import { createPixelText } from '../core/pixelText';
import { createCardArtwork, type CardArtworkFace, type CardLayerUrlResolver } from './cardArtwork';
import type { CardAttachments } from './cardLayers';
import { computeCardModalLayout, type CardModalLayout } from './cardLayout';
import { UI_PALETTE } from './theme';

export interface CardDetailModalOptions {
  readonly stageWidth?: number;
  readonly stageHeight?: number;
  readonly attachments?: CardAttachments;
  readonly resolveLayerUrl?: CardLayerUrlResolver;
  readonly onDismiss?: () => void;
}

export interface CardDetailModalController {
  readonly view: Container;
  readonly layout: CardModalLayout;
  dismiss(): void;
}

/**
 * A focus overlay that renders the card at its authored size and closes on any
 * click outside the card frame.
 */
export function createCardDetailModal(
  face: CardArtworkFace,
  options: CardDetailModalOptions = {},
): CardDetailModalController {
  const stageWidth = options.stageWidth ?? 640;
  const stageHeight = options.stageHeight ?? 400;
  const layout = computeCardModalLayout(stageWidth, stageHeight);
  const dismiss = (): void => options.onDismiss?.();

  const view = new Container();
  view.eventMode = 'static';

  const backdrop = new Graphics()
    .rect(0, 0, stageWidth, stageHeight)
    .fill({ color: UI_PALETTE.deepInk, alpha: 0.82 });
  backdrop.eventMode = 'none';
  view.addChild(backdrop);

  const artwork = createCardArtwork(face, {
    detailed: true,
    ...(options.attachments === undefined ? {} : { attachments: options.attachments }),
    ...(options.resolveLayerUrl === undefined ? {} : { resolveLayerUrl: options.resolveLayerUrl }),
  });
  const frame = new Container();
  frame.addChild(artwork.view);
  const cardHitTarget = new Graphics()
    .rect(0, 0, layout.nativeWidth, layout.nativeHeight)
    .fill({ color: UI_PALETTE.deepInk, alpha: 0.001 });
  cardHitTarget.eventMode = 'static';
  cardHitTarget.cursor = 'default';
  cardHitTarget.on('pointertap', (event) => event.stopPropagation());
  frame.addChild(cardHitTarget);
  frame.scale.set(layout.scale);
  frame.position.set(layout.x, layout.y);
  frame.eventMode = 'static';
  frame.hitArea = new Rectangle(0, 0, layout.nativeWidth, layout.nativeHeight);
  // Clicks that land on the card must not reach the dismissing backdrop.
  frame.on('pointertap', (event) => event.stopPropagation());
  view.addChild(frame);

  const hint = createPixelText('카드 밖을 클릭하면 닫힙니다', {
    fontSize: 8,
    fill: UI_PALETTE.muted,
  });
  hint.anchor.set(0.5, 1);
  hint.position.set(stageWidth / 2, stageHeight - 4);
  view.addChild(hint);

  // Partition the backdrop into explicit hit zones that never overlap the
  // card. This stays correct even when non-interactive artwork children make
  // Pixi target an ancestor instead of the visible frame.
  const addDismissZone = (x: number, y: number, width: number, height: number): void => {
    if (width <= 0 || height <= 0) return;
    const zone = new Graphics()
      .rect(x, y, width, height)
      .fill({ color: UI_PALETTE.deepInk, alpha: 0.001 });
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    zone.on('pointertap', dismiss);
    view.addChild(zone);
  };
  const cardRight = layout.x + layout.width;
  const cardBottom = layout.y + layout.height;
  addDismissZone(0, 0, stageWidth, layout.y);
  addDismissZone(0, cardBottom, stageWidth, stageHeight - cardBottom);
  addDismissZone(0, layout.y, layout.x, layout.height);
  addDismissZone(cardRight, layout.y, stageWidth - cardRight, layout.height);

  return { view, layout, dismiss };
}
