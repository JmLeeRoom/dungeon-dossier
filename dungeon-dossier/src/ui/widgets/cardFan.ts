import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import type { InterrogationCardView } from '../screens/interrogation/model';
import { createCardWidget, type CardLayerUrlResolver } from './cardWidget';
import type { CardAttachments, CardLayerId } from './cardLayers';
import {
  CARD_FAN_HEIGHT,
  CARD_FAN_SCALE,
  CARD_FAN_WIDTH,
  findCardDropTarget,
  layoutCardHand,
  type CardDropTarget,
  type CardHandSlot,
  type CardPoint,
} from './cardLayout';
import { dottedLinkSegments, type DottedLinkOptions, type LinkPoint } from './dottedLink';
import { UI_PALETTE } from './theme';

interface DottedLinkController {
  readonly view: Container;
  draw(from: LinkPoint, to: LinkPoint): void;
  clear(): void;
}

function createDottedLink(options: DottedLinkOptions = {}): DottedLinkController {
  const view = new Container();
  const graphics = new Graphics();
  view.addChild(graphics);
  view.visible = false;

  return {
    view,
    draw(from, to): void {
      graphics.clear();
      for (const segment of dottedLinkSegments(from, to, { curve: -28, ...options })) {
        graphics.moveTo(segment.from.x, segment.from.y).lineTo(segment.to.x, segment.to.y);
      }
      graphics.stroke({ color: UI_PALETTE.cyan, width: 2 });
      view.visible = true;
    },
    clear(): void {
      graphics.clear();
      view.visible = false;
    },
  };
}

export interface CardFanController {
  readonly view: Container;
  /** Dotted drag link; the screen adds this above the tag row. */
  readonly linkView: Container;
  selectByIndex(index: number): void;
  setSelected(cardId: string | undefined): void;
  setAttachments(cardId: string, attachments: CardAttachments): void;
  registerDropTarget(target: CardDropTarget): void;
  clearDropTargets(): void;
  destroy(): void;
}

export interface CardFanOptions {
  readonly onSelect?: (card: InterrogationCardView, index: number) => void;
  /** Raised by a click that was not a drag: open the full-size focus modal. */
  readonly onFocus?: (card: InterrogationCardView, index: number) => void;
  readonly onDropOnTarget?: (card: InterrogationCardView, targetId: string) => void;
  readonly onTargetHighlight?: (targetId: string | undefined) => void;
  readonly resolveLayerUrl?: (
    card: InterrogationCardView,
    layer: CardLayerId,
    attachmentId: string | undefined,
  ) => string | undefined;
  /** `ui/debuff/kiss` for a locked card; absent means no overlay art. */
  readonly resolveLockOverlayUrl?: (card: InterrogationCardView) => string | undefined;
  readonly attachments?: Readonly<Record<string, CardAttachments>>;
  readonly stageWidth?: number;
  readonly panelBottom?: number;
  readonly spacing?: number;
}

const DRAG_THRESHOLD = 4;
const DRAG_POINTER_GAP = 8;

interface CardEntry {
  readonly card: InterrogationCardView;
  readonly index: number;
  readonly view: Container;
  readonly outline: Graphics;
  readonly slot: CardHandSlot;
  artwork: Container;
}

function drawOutline(outline: Graphics, hovered: boolean, selected: boolean): void {
  outline.clear();
  if (!hovered && !selected) return;
  outline
    .rect(-2, -2, CARD_FAN_WIDTH + 4, CARD_FAN_HEIGHT + 4)
    .stroke({ color: hovered ? UI_PALETTE.cyan : UI_PALETTE.amber, width: 2 });
}

export function createCardFan(
  cards: readonly InterrogationCardView[],
  options: CardFanOptions = {},
): CardFanController {
  const view = new Container();
  view.sortableChildren = true;
  const link = createDottedLink();
  const slots = layoutCardHand(cards.length, {
    ...(options.stageWidth === undefined ? {} : { stageWidth: options.stageWidth }),
    ...(options.panelBottom === undefined ? {} : { panelBottom: options.panelBottom }),
    ...(options.spacing === undefined ? {} : { spacing: options.spacing }),
  });

  const entries: CardEntry[] = [];
  const dropTargets: CardDropTarget[] = [];
  const attachmentsByCard = new Map<string, CardAttachments>(
    Object.entries(options.attachments ?? {}),
  );
  let selectedId: string | undefined;
  let hoveredIndex: number | undefined;
  let dragIndex: number | undefined;
  let dragging = false;
  let dragOrigin: CardPoint = { x: 0, y: 0 };
  let highlightedTargetId: string | undefined;
  let destroyed = false;
  let focusTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const applyLayout = (): void => {
    entries.forEach((entry, index) => {
      const lifted = index === hoveredIndex || index === dragIndex;
      entry.view.position.set(entry.slot.x, lifted ? entry.slot.hoverY : entry.slot.restY);
      entry.view.rotation = lifted ? 0 : entry.slot.rotation;
      entry.view.zIndex = lifted ? 100 : index;
      drawOutline(entry.outline, lifted, entry.card.cardId === selectedId);
    });
  };

  const setHighlight = (targetId: string | undefined): void => {
    if (highlightedTargetId === targetId) return;
    highlightedTargetId = targetId;
    options.onTargetHighlight?.(targetId);
  };

  const resetDrag = (): void => {
    dragIndex = undefined;
    dragging = false;
    hoveredIndex = undefined;
    link.clear();
    setHighlight(undefined);
    applyLayout();
  };

  const endDrag = (event: FederatedPointerEvent): void => {
    const activeIndex = dragIndex;
    if (activeIndex === undefined) return;
    const activeEntry = entries[activeIndex];
    const wasDragging = dragging;
    const point = view.toLocal(event.global);
    resetDrag();
    if (activeEntry === undefined) return;
    if (!wasDragging) {
      // Adding the modal during pointerup lets the remainder of that same
      // federated click reach its dismissing backdrop. Wait until the release
      // dispatch has completely unwound.
      if (focusTimer !== undefined) globalThis.clearTimeout(focusTimer);
      focusTimer = globalThis.setTimeout(() => {
        focusTimer = undefined;
        if (!destroyed) options.onFocus?.(activeEntry.card, activeIndex);
      }, 0);
      return;
    }
    const target = findCardDropTarget(point, dropTargets);
    if (target !== undefined) options.onDropOnTarget?.(activeEntry.card, target.id);
  };

  const cancelDrag = (): void => {
    if (dragIndex === undefined) return;
    resetDrag();
  };

  const buildArtwork = (card: InterrogationCardView, index: number): Container => {
    const attachments = attachmentsByCard.get(card.cardId);
    const lockOverlayUrl = options.resolveLockOverlayUrl?.(card);
    const artwork = createCardWidget(
      {
        title: card.title,
        intent: card.intent,
        cpCost: card.cpCost,
        description: card.description,
        ordinal: index + 1,
        ...(card.locked === undefined ? {} : { locked: card.locked }),
        ...(card.lockTurnsRemaining === undefined
          ? {}
          : { lockTurnsRemaining: card.lockTurnsRemaining }),
      },
      {
        ...(attachments === undefined ? {} : { attachments }),
        ...(lockOverlayUrl === undefined ? {} : { lockOverlayUrl }),
        ...(options.resolveLayerUrl === undefined
          ? {}
          : {
              resolveLayerUrl: ((layer, attachmentId) =>
                options.resolveLayerUrl?.(card, layer, attachmentId)) satisfies CardLayerUrlResolver,
            }),
      },
    );
    artwork.view.scale.set(CARD_FAN_SCALE);
    return artwork.view;
  };

  const buildCard = (card: InterrogationCardView, index: number): void => {
    const slot = slots[index];
    if (slot === undefined) return;
    const cardView = new Container();
    const artwork = buildArtwork(card, index);
    const outline = new Graphics();
    cardView.addChild(artwork, outline);
    // A locked card still reads in the hand, but every pointer path through it
    // is closed: it cannot be selected, dragged onto a tag, or focused.
    const locked = card.locked === true;
    cardView.eventMode = locked ? 'none' : 'static';
    cardView.cursor = locked ? 'not-allowed' : 'pointer';

    cardView.on('pointerover', () => {
      if (dragging) return;
      hoveredIndex = index;
      applyLayout();
    });
    cardView.on('pointerout', () => {
      if (dragging || hoveredIndex !== index) return;
      hoveredIndex = undefined;
      applyLayout();
    });
    cardView.on('pointerdown', (event: FederatedPointerEvent) => {
      dragIndex = index;
      dragging = false;
      dragOrigin = { x: event.global.x, y: event.global.y };
      options.onSelect?.(card, index);
      applyLayout();
    });
    cardView.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (dragIndex !== index) return;
      const point = view.toLocal(event.global);
      if (
        !dragging &&
        Math.hypot(event.global.x - dragOrigin.x, event.global.y - dragOrigin.y) < DRAG_THRESHOLD
      ) {
        return;
      }
      dragging = true;
      // Keep the card above the cursor so it cannot cover the tag being
      // targeted. This also leaves the stippled connector and chip outline
      // visible instead of hiding both under an opaque card face.
      const draggedY = point.y - CARD_FAN_HEIGHT - DRAG_POINTER_GAP;
      cardView.position.set(point.x - CARD_FAN_WIDTH / 2, draggedY);
      const target = findCardDropTarget(point, dropTargets);
      setHighlight(target?.id);
      link.draw(
        { x: point.x, y: draggedY + CARD_FAN_HEIGHT },
        target === undefined
          ? { x: point.x, y: point.y }
          : {
              x: target.bounds.x + target.bounds.width / 2,
              y: target.bounds.y + target.bounds.height / 2,
            },
      );
    });

    cardView.on('pointerup', endDrag);
    cardView.on('pointerupoutside', endDrag);
    cardView.on('pointercancel', cancelDrag);

    entries.push({ card, index, view: cardView, outline, slot, artwork });
    view.addChild(cardView);
  };

  cards.forEach(buildCard);
  // The fan itself never moves, so it is the stable global-release owner when
  // a lifted/dragged child is retargeted between press and release.
  view.eventMode = 'static';
  view.on('globalpointerup', endDrag);
  view.on('pointercancel', cancelDrag);
  applyLayout();

  return {
    view,
    linkView: link.view,
    selectByIndex(index): void {
      const card = cards[index];
      if (card === undefined) return;
      // The keyboard reaches the same cards the pointer does, so it has to
      // honour the same lock. Without this, Digit1-9 could select a card the
      // engine will refuse to play and leave the selection visibly wrong.
      if (card.locked === true) return;
      selectedId = card.cardId;
      applyLayout();
      options.onSelect?.(card, index);
    },
    setSelected(cardId): void {
      selectedId = cardId;
      applyLayout();
    },
    setAttachments(cardId, attachments): void {
      attachmentsByCard.set(cardId, attachments);
      const entry = entries.find((candidate) => candidate.card.cardId === cardId);
      if (entry === undefined) return;
      entry.view.removeChild(entry.artwork);
      entry.artwork.destroy({ children: true });
      entry.artwork = buildArtwork(entry.card, entry.index);
      entry.view.addChildAt(entry.artwork, 0);
    },
    registerDropTarget(target): void {
      dropTargets.push(target);
    },
    clearDropTargets(): void {
      dropTargets.length = 0;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (focusTimer !== undefined) {
        globalThis.clearTimeout(focusTimer);
        focusTimer = undefined;
      }
      dragIndex = undefined;
      dragging = false;
      link.clear();
      link.view.destroy({ children: true });
      view.destroy({ children: true });
    },
  };
}
