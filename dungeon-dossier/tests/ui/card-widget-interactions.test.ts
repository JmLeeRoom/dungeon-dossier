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

    expect(first.position.y).toBe(371);
    expect(first.rotation).toBe(-0.01);

    emit(first, 'pointerover');
    expect(first.position.y).toBe(342);
    expect(first.rotation).toBe(0);
    expect(first.zIndex).toBe(100);

    emit(first, 'pointerout');
    expect(first.position.y).toBe(371);
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
    expect(first.position.x).toBe(-4);
    expect(first.position.y).toBe(107);
    expect(onTargetHighlight).toHaveBeenLastCalledWith('WHO');

    emit(first, 'pointerup', { global: { x: 60, y: 260 } });
    expect(onDropOnTarget).toHaveBeenCalledOnce();
    expect(onDropOnTarget).toHaveBeenCalledWith(CARDS[0], 'WHO');
    expect(onTargetHighlight).toHaveBeenLastCalledWith(undefined);
    expect(fan.linkView.visible).toBe(false);
    expect(first.position.y).toBe(371);

    // A bubbled/global release after the card release must not duplicate docking.
    emit(fan.view, 'globalpointerup', { global: { x: 60, y: 260 } });
    expect(onDropOnTarget).toHaveBeenCalledOnce();

    fan.destroy();
  });

  it('distinguishes a click from a drag and opens focus after release dispatch', () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const fan = createCardFan(CARDS, { onFocus });
    const first = fan.view.children[0];
    if (!(first instanceof Container)) throw new Error('Expected a card container.');

    emit(first, 'pointerdown', { global: { x: 110, y: 380 } });
    emit(first, 'pointerup', { global: { x: 110, y: 380 } });
    expect(onFocus).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledWith(CARDS[0], 0);

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
      nativeWidth: 640,
      nativeHeight: 725,
      scale: 0.5,
      width: 320,
      height: 362.5,
      x: 160,
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
