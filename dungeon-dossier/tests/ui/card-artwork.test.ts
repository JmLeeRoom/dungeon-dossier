import { Container, Graphics } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

interface RecordedText {
  readonly text: string;
  readonly options: Readonly<Record<string, unknown>>;
  readonly x: number;
  readonly y: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

interface MockTextView extends Container {
  text: string;
  readonly pixelTextOptions: Readonly<Record<string, unknown>>;
  readonly anchor: Readonly<{ x: number; y: number; set(x: number, y?: number): void }>;
}

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string, options: Record<string, unknown> = {}) {
      const view = new TextContainer() as unknown as MockTextView;
      const anchor = {
        x: 0,
        y: 0,
        set(x: number, y?: number): void {
          anchor.x = x;
          anchor.y = y ?? x;
        },
      };
      Object.defineProperties(view, {
        anchor: { value: anchor },
        text: { value: text, writable: true },
        pixelTextOptions: { value: options },
      });
      return view;
    },
  };
});

import { createCardArtwork } from '../../src/ui/widgets/cardArtwork';
import {
  CARD_COPY_FONT_SIZES,
  CARD_COPY_LINE_HEIGHTS,
  CARD_COPY_RECTS,
  CARD_FAN_SCALE,
  CARD_LAYER_RECTS,
  CARD_SIZE,
  cardCopyDisplayFontSize,
  cardDescriptionLineCapacity,
} from '../../src/ui/widgets/cardLayout';

const FACE = {
  title: '모순 지적',
  intent: 'CONTRADICT',
  cpCost: 2,
  description: '증거로 진술의 모순을 지적한다.',
} as const;

function isMockText(node: Container): node is MockTextView {
  return typeof (node as unknown as Partial<MockTextView>).text === 'string';
}

/**
 * Copy containers are never offset, so a node's local position is already its
 * position in the authored 640x725 card space.
 */
function collectTexts(node: Container, collected: RecordedText[] = []): RecordedText[] {
  if (isMockText(node)) {
    collected.push({
      text: node.text,
      options: node.pixelTextOptions,
      x: node.position.x,
      y: node.position.y,
      anchorX: node.anchor.x,
      anchorY: node.anchor.y,
    });
  }
  for (const child of node.children) {
    if (child instanceof Container) collectTexts(child, collected);
  }
  return collected;
}

function findText(node: Container, predicate: (entry: RecordedText) => boolean): RecordedText {
  const match = collectTexts(node).find(predicate);
  if (match === undefined) throw new Error('Expected copy was not rendered on the card face.');
  return match;
}

function findParentOfText(node: Container, text: string): Container {
  for (const child of node.children) {
    if (!(child instanceof Container)) continue;
    if (isMockText(child) && child.text === text) return node;
    const nested = tryFindParentOfText(child, text);
    if (nested !== undefined) return nested;
  }
  throw new Error(`No container renders the copy "${text}".`);
}

function tryFindParentOfText(node: Container, text: string): Container | undefined {
  for (const child of node.children) {
    if (!(child instanceof Container)) continue;
    if (isMockText(child) && child.text === text) return node;
    const nested = tryFindParentOfText(child, text);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

describe('card face three-zone layout', () => {
  it('keeps every copy zone inside the authored frame without overlapping', () => {
    const zones = [
      CARD_COPY_RECTS.cpBadge,
      CARD_COPY_RECTS.title,
      CARD_COPY_RECTS.intent,
      CARD_COPY_RECTS.description,
      CARD_LAYER_RECTS.illust,
    ];
    for (const zone of zones) {
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.x + zone.width).toBeLessThanOrEqual(CARD_SIZE.width);
      expect(zone.y + zone.height).toBeLessThanOrEqual(CARD_SIZE.height);
    }

    // Cost badge sits left of the title; both sit above the illustration band.
    expect(CARD_COPY_RECTS.cpBadge.x + CARD_COPY_RECTS.cpBadge.width)
      .toBeLessThanOrEqual(CARD_COPY_RECTS.title.x);
    expect(CARD_COPY_RECTS.title.y + CARD_COPY_RECTS.title.height)
      .toBeLessThanOrEqual(CARD_LAYER_RECTS.illust.y);
    // Intent label owns the left column beside the right-aligned illustration.
    expect(CARD_COPY_RECTS.intent.x + CARD_COPY_RECTS.intent.width)
      .toBeLessThanOrEqual(CARD_LAYER_RECTS.illust.x);
    // Description block clears the illustration entirely.
    expect(CARD_COPY_RECTS.description.y)
      .toBeGreaterThanOrEqual(CARD_LAYER_RECTS.illust.y + CARD_LAYER_RECTS.illust.height);
  });

  it('keeps every attachable layer clear of the permanent description block', () => {
    // Attachments draw above the base layer, so any overlap would paint over
    // body copy that is now always on the face.
    const description = CARD_COPY_RECTS.description;
    for (const layer of ['stamp', 'evidence'] as const) {
      const rect = CARD_LAYER_RECTS[layer];
      const overlaps =
        rect.x < description.x + description.width &&
        rect.x + rect.width > description.x &&
        rect.y < description.y + description.height &&
        rect.y + rect.height > description.y;
      expect(overlaps, `${layer} must not cover the description`).toBe(false);
    }
  });

  it('docks the stamp in the left column beside the illustration', () => {
    const stamp = CARD_LAYER_RECTS.stamp;
    expect(stamp.x + stamp.width).toBeLessThanOrEqual(CARD_LAYER_RECTS.illust.x);
    expect(stamp.y).toBeGreaterThanOrEqual(
      CARD_COPY_RECTS.intent.y + CARD_COPY_RECTS.intent.height,
    );
    expect(stamp.y + stamp.height).toBeLessThanOrEqual(CARD_COPY_RECTS.description.y);
  });

  it('right-aligns the illustration with the shared 40px margin', () => {
    expect(CARD_LAYER_RECTS.illust).toEqual({ x: 344, y: 176, width: 256, height: 256 });
    expect(CARD_SIZE.width - (CARD_LAYER_RECTS.illust.x + CARD_LAYER_RECTS.illust.width))
      .toBe(CARD_COPY_RECTS.cpBadge.x);
  });

  it('renders the cost as a top-left badge with a plate behind it', () => {
    const artwork = createCardArtwork(FACE);
    const rect = CARD_COPY_RECTS.cpBadge;
    const cost = findText(artwork.view, (entry) => entry.text === '2 CP');

    expect(cost.x).toBe(rect.x + rect.width / 2);
    expect(cost.y).toBe(rect.y + rect.height / 2);
    expect({ x: cost.anchorX, y: cost.anchorY }).toEqual({ x: 0.5, y: 0.5 });
    expect(cost.options.fontSize).toBe(CARD_COPY_FONT_SIZES.cpBadge);
    // Badge is drawn top-left, never in the old bottom-right corner.
    expect(cost.y).toBeLessThan(CARD_SIZE.height / 2);
    expect(cost.x).toBeLessThan(CARD_SIZE.width / 2);

    const badge = findParentOfText(artwork.view, '2 CP');
    expect(badge.children.some((child) => child instanceof Graphics)).toBe(true);

    artwork.view.destroy({ children: true });
  });

  it('always renders the description block, not only in the focus modal', () => {
    const artwork = createCardArtwork(FACE);
    const rect = CARD_COPY_RECTS.description;
    const body = findText(artwork.view, (entry) => entry.text === FACE.description);

    expect({ x: body.x, y: body.y }).toEqual({ x: rect.x, y: rect.y });
    expect(body.options).toMatchObject({
      fontSize: CARD_COPY_FONT_SIZES.description,
      wordWrap: true,
      wordWrapWidth: rect.width,
      lineHeight: CARD_COPY_LINE_HEIGHTS.description,
    });

    artwork.view.destroy({ children: true });
  });

  it('omits the description block when a card authors no body copy', () => {
    const artwork = createCardArtwork({ title: '질문', intent: 'QUERY', cpCost: 1 });
    const texts = collectTexts(artwork.view).map((entry) => entry.text);

    expect(texts).toContain('질문');
    expect(texts).toContain('1 CP');
    expect(texts).toContain('QUERY');
    expect(texts).toHaveLength(3);

    artwork.view.destroy({ children: true });
  });

  it('moves the hand-slot ordinal opposite the cost badge', () => {
    const artwork = createCardArtwork({ ...FACE, ordinal: 3 });
    const rect = CARD_COPY_RECTS.ordinal;
    const ordinal = findText(artwork.view, (entry) => entry.text === '3');

    expect(ordinal.x).toBe(rect.x + rect.width);
    expect(ordinal.anchorX).toBe(1);
    expect(ordinal.x).toBeGreaterThan(
      CARD_COPY_RECTS.cpBadge.x + CARD_COPY_RECTS.cpBadge.width,
    );

    artwork.view.destroy({ children: true });
  });
});

describe('authored copy sizing at hand scale', () => {
  it('authors 40px copy so the fan renders it at exactly 8px', () => {
    expect(CARD_FAN_SCALE).toBe(0.2);
    expect(cardCopyDisplayFontSize(CARD_COPY_FONT_SIZES.description)).toBe(8);
    expect(cardCopyDisplayFontSize(CARD_COPY_FONT_SIZES.title)).toBe(8);
    expect(cardCopyDisplayFontSize(CARD_COPY_FONT_SIZES.intent)).toBe(6);
    // The focus modal composites at native size, so authored px are display px.
    expect(cardCopyDisplayFontSize(CARD_COPY_FONT_SIZES.description, 1)).toBe(40);
  });

  it('fits four wrapped description lines in the fixed block', () => {
    expect(cardDescriptionLineCapacity()).toBe(4);
    expect(
      cardDescriptionLineCapacity() * CARD_COPY_LINE_HEIGHTS.description,
    ).toBeLessThanOrEqual(CARD_COPY_RECTS.description.height);
  });
});
