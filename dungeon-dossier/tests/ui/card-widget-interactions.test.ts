import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer() as Container & {
        anchor: Readonly<{ set(x: number, y?: number): void }>;
        text: string;
      };
      Object.defineProperties(view, {
        anchor: { value: { set: () => undefined } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import type { InterrogationCardView } from '../../src/ui/screens/interrogation/model';
import { createCardDetailModal } from '../../src/ui/widgets/cardDetailModal';
import { createCardFan } from '../../src/ui/widgets/cardFan';
import { CARD_FAN_HEIGHT, CARD_FAN_WIDTH } from '../../src/ui/widgets/cardLayout';

const CARDS: readonly InterrogationCardView[] = [
  {
    cardId: 'card-one',
    title: '첫 번째 카드',
    description: '첫 번째 설명',
    intent: 'QUERY',
    cpCost: 1,
    requiresEvidence: false,
  },
  {
    cardId: 'card-two',
    title: '두 번째 카드',
    description: '두 번째 설명',
    intent: 'CONTRADICT',
    cpCost: 2,
    requiresEvidence: true,
  },
];

type EventEmitter = Readonly<{
  emit(event: string, ...arguments_: unknown[]): boolean;
}>;

function emit(target: Container, event: string, value?: unknown): void {
  (target as unknown as EventEmitter).emit(event, value);
}

describe('card fan pointer interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lifts on hover and restores the authored fan pose on pointerout', () => {
    const fan = createCardFan(CARDS, { spacing: 76 });
    const first = fan.view.children[0];
    if (!(first instanceof Container)) throw new Error('Expected a card container.');

    expect(first.position.y).toBe(362);
    expect(first.rotation).toBe(-0.01);

    emit(first, 'pointerover');
    expect(first.position.y).toBe(323);
    expect(first.rotation).toBe(0);
    expect(first.zIndex).toBe(100);

    emit(first, 'pointerout');
    expect(first.position.y).toBe(362);
    expect(first.rotation).toBe(-0.01);
    expect(first.zIndex).toBe(0);

    fan.destroy();
  });

  it('draws a live dotted link and docks exactly once on a registered facet target', () => {
    const onSelect = vi.fn();
    const onDropOnTarget = vi.fn();
    const onTargetHighlight = vi.fn();
    const fan = createCardFan(CARDS, {
      spacing: 76,
      onSelect,
      onDropOnTarget,
      onTargetHighlight,
    });
    fan.registerDropTarget({
      id: 'WHO',
      bounds: { x: 12, y: 250, width: 99, height: 26 },
    });
    const first = fan.view.children[0];
    if (!(first instanceof Container)) throw new Error('Expected a card container.');

    emit(first, 'pointerdown', { global: { x: 110, y: 380 } });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(CARDS[0], 0);

    emit(first, 'globalpointermove', { global: { x: 60, y: 260 } });
    expect(fan.linkView.visible).toBe(true);
    // The card rides above the cursor so it never covers the chip it targets.
    expect(first.position.x).toBe(60 - CARD_FAN_WIDTH / 2);
    expect(first.position.y).toBe(260 - CARD_FAN_HEIGHT - 8);
    expect(onTargetHighlight).toHaveBeenLastCalledWith('WHO');

    emit(first, 'pointerup', { global: { x: 60, y: 260 } });
    expect(onDropOnTarget).toHaveBeenCalledOnce();
    expect(onDropOnTarget).toHaveBeenCalledWith(CARDS[0], 'WHO', 0);
    expect(onTargetHighlight).toHaveBeenLastCalledWith(undefined);
    expect(fan.linkView.visible).toBe(false);
    expect(first.position.y).toBe(208);

    // A bubbled/global release after the card release must not duplicate docking.
    emit(fan.view, 'globalpointerup', { global: { x: 60, y: 260 } });
    expect(onDropOnTarget).toHaveBeenCalledOnce();

    fan.destroy();
  });

  it('selects on the first click and opens focus only on the second click', () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const fan = createCardFan(CARDS, { onFocus });
    const first = fan.view.children[0];
    if (!(first instanceof Container)) throw new Error('Expected a card container.');

    emit(first, 'pointerdown', { global: { x: 110, y: 380 } });
    emit(first, 'pointerup', { global: { x: 110, y: 380 } });
    expect(onFocus).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(onFocus).not.toHaveBeenCalled();

    emit(first, 'pointerdown', { global: { x: 110, y: 240 } });
    emit(first, 'pointerup', { global: { x: 110, y: 240 } });
    vi.runAllTimers();
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledWith(CARDS[0], 0);

    fan.destroy();
  });

  it('keeps duplicate blueprints independent by physical instance id', () => {
    const duplicates: readonly InterrogationCardView[] = [
      { ...CARDS[0]!, instanceId: 'instance-1' },
      { ...CARDS[0]!, instanceId: 'instance-2' },
    ];
    const onSelect = vi.fn();
    const fan = createCardFan(duplicates, { spacing: 76, onSelect });
    const first = fan.view.children[0];
    const second = fan.view.children[1];
    if (!(first instanceof Container) || !(second instanceof Container)) {
      throw new Error('Expected duplicate card containers.');
    }

    emit(first, 'pointerdown', { global: { x: 100, y: 380 } });
    emit(first, 'pointerup', { global: { x: 100, y: 380 } });
    expect(first.position.y).toBe(208);
    expect(second.position.y).toBe(362);
    expect(onSelect).toHaveBeenLastCalledWith(duplicates[0], 0);

    emit(second, 'pointerdown', { global: { x: 180, y: 380 } });
    emit(second, 'pointerup', { global: { x: 180, y: 380 } });
    expect(first.position.y).toBe(362);
    expect(second.position.y).toBe(208);
    expect(onSelect).toHaveBeenLastCalledWith(duplicates[1], 1);

    const firstArtwork = first.children[0];
    const secondArtwork = second.children[0];
    fan.setAttachments('instance-2', { evidenceIds: ['ev-2'] });
    expect(first.children[0]).toBe(firstArtwork);
    expect(second.children[0]).not.toBe(secondArtwork);

    fan.destroy();
  });

  it('closes every input path into a locked card, pointer and keyboard alike', () => {
    const onSelect = vi.fn();
    const onFocus = vi.fn();
    const locked = { ...CARDS[0]!, locked: true, lockTurnsRemaining: 2 };
    const fan = createCardFan([locked, CARDS[1]!], { spacing: 76, onSelect, onFocus });

    const first = fan.view.children[0];
    if (!(first instanceof Container)) throw new Error('Expected a card container.');
    // Pointer: the card is inert, so a press cannot even start a selection.
    expect(first.eventMode).toBe('none');
    expect(first.cursor).toBe('not-allowed');

    // Keyboard: Digit1 routes here, and it must honour the same lock rather
    // than selecting a card the engine will refuse to play.
    fan.selectByIndex(0);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();

    // The unlocked neighbour is unaffected.
    fan.selectByIndex(1);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(CARDS[1], 1);

    fan.destroy();
  });
});

describe('card detail modal pointer partition', () => {
  it('keeps inside clicks contained and dismisses from each outside hit zone', () => {
    const onDismiss = vi.fn();
    const modal = createCardDetailModal(
      {
        title: '모순 지적',
        description: '증거로 진술의 모순을 지적한다.',
        intent: 'CONTRADICT',
        cpCost: 2,
      },
      { onDismiss },
    );

    expect(modal.layout).toMatchObject({
      nativeWidth: 768,
      nativeHeight: 1024,
      width: 271.875,
      height: 362.5,
      x: 184,
      y: 19,
    });

    const frame = modal.view.children[1];
    if (!(frame instanceof Container)) throw new Error('Expected a modal card frame.');
    const stopPropagation = vi.fn();
    emit(frame, 'pointertap', { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();

    const outsideZones = modal.view.children.slice(3);
    expect(outsideZones).toHaveLength(4);
    for (const zone of outsideZones) emit(zone, 'pointertap');
    expect(onDismiss).toHaveBeenCalledTimes(4);

    modal.view.destroy({ children: true });
  });
});
