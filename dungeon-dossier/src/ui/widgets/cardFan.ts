import { Container, Graphics } from 'pixi.js';
import type { InterrogationCardView } from '../screens/interrogation/model';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface CardFanPosition {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export function layoutCardFan(cardCount: number, cardWidth = 64): readonly CardFanPosition[] {
  const count = Math.max(0, Math.floor(cardCount));
  const centre = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => {
    const offset = index - centre;
    return {
      x: Math.round(index * (cardWidth - 10)),
      y: Math.round(Math.abs(offset) * 4),
      rotation: offset * 0.035,
    };
  });
}

export interface CardFanController {
  readonly view: Container;
  selectByIndex(index: number): void;
  setSelected(cardId: string | undefined): void;
}

export interface CardFanOptions {
  readonly onSelect?: (card: InterrogationCardView, index: number) => void;
}

const INTENT_COLOURS: Readonly<Record<string, number>> = {
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

export function createCardFan(
  cards: readonly InterrogationCardView[],
  options: CardFanOptions = {},
): CardFanController {
  const view = new Container();
  const positions = layoutCardFan(cards.length);
  const plates: Graphics[] = [];
  let selectedId: string | undefined;

  const redraw = (): void => {
    cards.forEach((card, index) => {
      const plate = plates[index];
      if (plate === undefined) return;
      const selected = card.cardId === selectedId;
      const fill = INTENT_COLOURS[card.intent] ?? UI_PALETTE.panelLight;
      plate
        .clear()
        .rect(0, selected ? -4 : 0, 64, 72)
        .fill(fill)
        .stroke({ color: selected ? UI_PALETTE.cyan : UI_PALETTE.parchmentDark, width: 2 })
        .rect(4, selected ? 15 : 19, 56, 44)
        .fill(UI_PALETTE.deepInk)
        .rect(7, selected ? 18 : 22, 50, 38)
        .stroke({ color: UI_PALETTE.muted, width: 1 });
    });
  };

  cards.forEach((card, index) => {
    const position = positions[index];
    if (position === undefined) return;
    const cardView = new Container();
    const plate = new Graphics();
    plates.push(plate);
    const number = createPixelText((index + 1).toString(), {
      fontSize: 8,
      fill: UI_PALETTE.paper,
    });
    number.position.set(4, 3);
    const title = createPixelText(card.title, {
      fontSize: 8,
      fill: UI_PALETTE.paper,
      wordWrap: true,
      wordWrapWidth: 48,
      align: 'center',
      lineHeight: 9,
    });
    title.anchor.set(0.5, 0);
    title.position.set(32, 3);
    const artLabel = createPixelText(card.intent.slice(0, 3), {
      fontSize: 8,
      fill: UI_PALETTE.muted,
    });
    artLabel.anchor.set(0.5);
    artLabel.position.set(32, 40);
    const cost = createPixelText(`${card.cpCost} CP`, {
      fontSize: 7,
      fill: UI_PALETTE.paper,
    });
    cost.position.set(37, 62);
    cardView.position.set(position.x, position.y);
    cardView.rotation = position.rotation;
    cardView.addChild(plate, number, title, artLabel, cost);
    if (options.onSelect !== undefined) {
      cardView.eventMode = 'static';
      cardView.cursor = 'pointer';
      cardView.on('pointertap', () => options.onSelect?.(card, index));
    }
    view.addChild(cardView);
  });
  redraw();

  const selectByIndex = (index: number): void => {
    const card = cards[index];
    if (card === undefined) return;
    selectedId = card.cardId;
    redraw();
    options.onSelect?.(card, index);
  };

  return {
    view,
    selectByIndex,
    setSelected(cardId): void {
      selectedId = cardId;
      redraw();
    },
  };
}
