import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer();
      Object.defineProperties(view, {
        anchor: { value: { x: 0, y: 0, set(): void {} } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import { createCardWidget, type CardFace } from '../../src/ui/widgets/cardWidget';
import { createCardAttachments } from '../../src/ui/widgets/cardLayers';
import {
  CARD_LAYER_RECTS,
  CARD_LOCK_Z_INDEX,
  CARD_SIZE,
} from '../../src/ui/widgets/cardLayout';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const FACE: CardFace = {
  title: '모순 지적',
  intent: 'CONTRADICT',
  cpCost: 2,
  description: '증거로 진술의 모순을 지적한다.',
};

const fullyAttached = createCardAttachments({
  stampId: 'RED',
  postId: 'HOW',
  evidenceIds: ['ev1', 'ev2', 'ev3'],
});

describe('eight-layer card composition', () => {
  it('exposes the permanent cost, name, and ability layers independently', () => {
    const card = createCardWidget(FACE, {
      attachments: fullyAttached,
      resolveLayerUrl: () => WHITE_TEXTURE_URL,
    });

    expect(Object.keys(card.permanentLayers)).toEqual([
      'base', 'cost', 'name', 'ability', 'illust',
    ]);
    expect(Object.values(card.permanentLayers).map((layer) => layer?.zIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(card.view.sortableChildren).toBe(true);

    card.view.destroy({ children: true });
  });

  it('renders base, illustration, seal, post-it and three polaroids in order', () => {
    const card = createCardWidget(FACE, {
      attachments: fullyAttached,
      resolveLayerUrl: () => WHITE_TEXTURE_URL,
    });
    expect(card.stack.map((slot) => slot.layer)).toEqual([
      'base',
      'cost',
      'name',
      'ability',
      'illust',
      'stamp',
      'post',
      'evidence',
      'evidence',
      'evidence',
    ]);
    // five permanent layers + stamp + post + three evidence layers
    expect(card.view.children).toHaveLength(10);
    card.view.destroy({ children: true });
  });

  it('drops evidence past the third rather than running it off the card', () => {
    const card = createCardWidget(FACE, {
      attachments: createCardAttachments({ evidenceIds: ['a', 'b', 'c', 'd', 'e'] }),
      resolveLayerUrl: () => WHITE_TEXTURE_URL,
    });
    const evidenceSlots = card.stack.filter((slot) => slot.layer === 'evidence');
    // The stack still records what is docked...
    expect(evidenceSlots.length).toBeGreaterThan(3);
    // ...but only three are composited, and all of them stay on the card.
    const drawn = card.view.children.filter((child) => child.zIndex === 7);
    expect(drawn).toHaveLength(3);
    for (const child of drawn) {
      const half = CARD_LAYER_RECTS.evidence.width / 2;
      expect(child.position.x - half).toBeGreaterThanOrEqual(0);
      expect(child.position.x + half).toBeLessThanOrEqual(CARD_SIZE.width);
    }
    card.view.destroy({ children: true });
  });

  it('gives the card an explicit hit area no decoration can change', () => {
    const bare = createCardWidget(FACE);
    const decorated = createCardWidget(FACE, {
      attachments: fullyAttached,
      resolveLayerUrl: () => WHITE_TEXTURE_URL,
    });

    for (const card of [bare, decorated]) {
      expect(card.view.hitArea).toBeInstanceOf(Rectangle);
      expect(card.view.hitArea).toMatchObject({
        x: 0,
        y: 0,
        width: CARD_SIZE.width,
        height: CARD_SIZE.height,
      });
      // Every composited child is inert, so growing the artwork cannot move or
      // steal the card's click target.
      for (const child of card.view.children) {
        expect(child.eventMode).toBe('none');
      }
    }
    bare.view.destroy({ children: true });
    decorated.view.destroy({ children: true });
  });

  it('draws the debuff overlay above everything only while the card is locked', () => {
    const unlocked = createCardWidget(FACE, { lockOverlayUrl: WHITE_TEXTURE_URL });
    expect(unlocked.view.children.some((child) => child.zIndex === CARD_LOCK_Z_INDEX)).toBe(false);

    const locked = createCardWidget(
      { ...FACE, locked: true, lockTurnsRemaining: 2 },
      { lockOverlayUrl: WHITE_TEXTURE_URL },
    );
    const overlay = locked.view.children.find((child) => child.zIndex === CARD_LOCK_Z_INDEX);
    expect(overlay).toBeInstanceOf(Container);
    expect(CARD_LOCK_Z_INDEX).toBeGreaterThan(7);
    // A scrim, the kiss art, and the remaining turn count.
    expect(overlay?.children.filter((child) => child instanceof Sprite)).toHaveLength(1);
    expect(overlay?.children.filter((child) => child instanceof Graphics)).toHaveLength(1);

    unlocked.view.destroy({ children: true });
    locked.view.destroy({ children: true });
  });

  it('falls back to vector layers when a key resolves to nothing', () => {
    const card = createCardWidget(FACE, { attachments: fullyAttached });
    // No sprite anywhere: a missing decorative key draws the placeholder shape
    // rather than a broken texture.
    const sprites = card.view.children.flatMap((child) =>
      child.children.filter((leaf) => leaf instanceof Sprite),
    );
    expect(sprites).toHaveLength(0);
    expect(card.view.children.length).toBeGreaterThan(1);
    card.view.destroy({ children: true });
  });
});
