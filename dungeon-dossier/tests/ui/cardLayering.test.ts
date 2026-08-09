import { describe, expect, it } from 'vitest';
import {
  CARD_ATTACHABLE_LAYER_IDS,
  CARD_LAYER_IDS,
  CARD_LAYER_Z_INDEX,
  CARD_PERMANENT_LAYER_IDS,
  DEFAULT_MAX_CARD_EVIDENCE,
  attachEvidence,
  attachPost,
  attachStamp,
  buildCardLayerStack,
  createCardAttachments,
  detachEvidence,
  detachPost,
  detachStamp,
  isCardLayerId,
} from '../../src/ui/widgets/cardLayers';
import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import {
  CARD_FAN_HEIGHT,
  CARD_FAN_SCALE,
  CARD_FAN_WIDTH,
  CARD_HOVER_REVEAL_RATIO,
  CARD_LAYER_RECTS,
  CARD_MODAL_BOX,
  CARD_REST_REVEAL_RATIO,
  CARD_SIZE,
  cardLayerZIndex,
  cardRevealHeight,
  computeCardModalLayout,
  findCardDropTarget,
  layoutCardEvidence,
  layoutCardHand,
} from '../../src/ui/widgets/cardLayout';
import { dottedLinkControlPoint, dottedLinkSegments } from '../../src/ui/widgets/dottedLink';
import { INTERNAL_WIDTH } from '../../src/ui/core/integerScale';
import {
  TAG_ROW_HEIGHT,
  TAG_ROW_Y,
} from '../../src/ui/screens/interrogation/createInterrogationScreen';

describe('five-layer card stack', () => {
  it('orders the layers base, illust, stamp, post, evidence', () => {
    expect(CARD_LAYER_IDS).toEqual(['base', 'illust', 'stamp', 'post', 'evidence']);
    expect(CARD_LAYER_Z_INDEX).toEqual({ base: 0, illust: 1, stamp: 2, post: 3, evidence: 4 });
    expect(CARD_PERMANENT_LAYER_IDS).toEqual(['base', 'illust']);
    expect(CARD_ATTACHABLE_LAYER_IDS).toEqual(['stamp', 'post', 'evidence']);
    expect(CARD_LAYER_IDS.map(cardLayerZIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(isCardLayerId('post')).toBe(true);
    expect(isCardLayerId('shadow')).toBe(false);
  });

  it('renders only base and illust before anything is docked', () => {
    const stack = buildCardLayerStack();
    expect(stack).toEqual([
      { layer: 'base', zIndex: 0, attachmentId: undefined },
      { layer: 'illust', zIndex: 1, attachmentId: undefined },
    ]);
  });

  it('adds stamp, post, and one slot per docked evidence in ascending z-index', () => {
    let attachments = attachStamp(createCardAttachments(), 'stamp-sealed');
    attachments = attachPost(attachments, 'post-glow');
    attachments = attachEvidence(attachments, 'evidence-roster');
    attachments = attachEvidence(attachments, 'evidence-photo');

    const stack = buildCardLayerStack(attachments);
    expect(stack.map((slot) => slot.layer)).toEqual([
      'base',
      'illust',
      'stamp',
      'post',
      'evidence',
      'evidence',
    ]);
    expect(stack.map((slot) => slot.zIndex)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(stack.at(-1)).toEqual({ layer: 'evidence', zIndex: 4, attachmentId: 'evidence-photo' });
    expect([...stack].sort((left, right) => left.zIndex - right.zIndex)).toEqual(stack);
  });

  it('keeps evidence docking idempotent, bounded, and reversible', () => {
    const base = createCardAttachments();
    const once = attachEvidence(base, 'evidence-roster');
    expect(attachEvidence(once, 'evidence-roster')).toBe(once);
    expect(DEFAULT_MAX_CARD_EVIDENCE).toBe(3);

    const full = ['a', 'b', 'c', 'd'].reduce((state, id) => attachEvidence(state, id), base);
    expect(full.evidenceIds).toEqual(['a', 'b', 'c']);
    expect(attachEvidence(base, 'a', 0).evidenceIds).toEqual([]);

    expect(detachEvidence(full, 'b').evidenceIds).toEqual(['a', 'c']);
    expect(detachEvidence(full, 'missing')).toBe(full);
    expect(detachStamp(attachStamp(base, 's')).stampId).toBeUndefined();
    expect(detachPost(attachPost(base, 'p')).postId).toBeUndefined();
    expect(base.evidenceIds).toEqual([]);
  });

  it('lays every layer out inside the authored 768x1024 card frame', () => {
    expect(CARD_SIZE).toEqual(ASSET_DIMENSIONS.card_base_768x1024);
    expect(CARD_LAYER_RECTS.base).toEqual({ x: 0, y: 0, width: 768, height: 1024 });
    // The post-it is an addition clipped to the file, not a full-card tint.
    expect(CARD_LAYER_RECTS.post.width).toBeLessThan(CARD_SIZE.width);
    expect(CARD_LAYER_RECTS.evidence.y).toBeLessThan(CARD_LAYER_RECTS.illust.y);

    for (const layer of CARD_LAYER_IDS) {
      const rect = CARD_LAYER_RECTS[layer];
      expect(rect.x, layer).toBeGreaterThanOrEqual(0);
      expect(rect.y, layer).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width, layer).toBeLessThanOrEqual(CARD_SIZE.width);
      expect(rect.y + rect.height, layer).toBeLessThanOrEqual(CARD_SIZE.height);
    }
  });

  it('fans up to three evidence polaroids without leaving the card', () => {
    expect(layoutCardEvidence(0)).toEqual([]);
    expect(layoutCardEvidence(1)).toEqual([
      { x: CARD_LAYER_RECTS.evidence.x, y: CARD_LAYER_RECTS.evidence.y, rotation: 0 },
    ]);

    const three = layoutCardEvidence(3);
    expect(three).toHaveLength(3);
    expect(three.map((placement) => placement.rotation)).toEqual([-0.06, 0, 0.06]);
    // A fourth docked item is dropped rather than run off the card edge.
    expect(layoutCardEvidence(9)).toHaveLength(DEFAULT_MAX_CARD_EVIDENCE);

    for (const placement of layoutCardEvidence(3)) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.x + CARD_LAYER_RECTS.evidence.width).toBeLessThanOrEqual(CARD_SIZE.width);
    }
  });
});

describe('card hand reveal and focus modal', () => {
  it('shows the top 20% at rest and lifts to 40% on hover', () => {
    expect(CARD_REST_REVEAL_RATIO).toBe(0.2);
    expect(CARD_HOVER_REVEAL_RATIO).toBe(0.4);
    // 3/16 of 768x1024. Both dimensions stay whole, so the reveal heights and
    // the hit rectangle land on integers too.
    expect({ width: CARD_FAN_WIDTH, height: CARD_FAN_HEIGHT }).toEqual({ width: 144, height: 192 });
    expect(CARD_FAN_SCALE).toBe(0.1875);

    expect(cardRevealHeight(CARD_REST_REVEAL_RATIO)).toBe(38);
    expect(cardRevealHeight(CARD_HOVER_REVEAL_RATIO)).toBe(77);
    expect(cardRevealHeight(2)).toBe(CARD_FAN_HEIGHT);
    expect(cardRevealHeight(-1)).toBe(0);
    expect(cardRevealHeight(Number.NaN)).toBe(0);
  });

  it('centres the hand and lifts only the y offset', () => {
    const slots = layoutCardHand(5, { spacing: 76 });
    expect(slots).toHaveLength(5);
    expect(slots.map((slot) => slot.x)).toEqual([96, 172, 248, 324, 400]);
    expect(new Set(slots.map((slot) => slot.restY))).toEqual(new Set([362]));
    expect(new Set(slots.map((slot) => slot.hoverY))).toEqual(new Set([323]));
    expect(slots[2]?.rotation).toBe(0);
    expect(slots[0]?.rotation).toBe(-0.04);
    expect(layoutCardHand(0)).toEqual([]);
    expect(layoutCardHand(-3)).toEqual([]);
  });

  it('fits a full five-card hand inside the stage at the authored pitch', () => {
    const slots = layoutCardHand(5);
    const first = slots[0];
    const last = slots.at(-1);
    if (first === undefined || last === undefined) throw new Error('Expected five slots.');
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(last.x + CARD_FAN_WIDTH).toBeLessThanOrEqual(INTERNAL_WIDTH);
    // Even lifted, the hand stays clear of the tag row it drops cards onto.
    expect(first.hoverY).toBeGreaterThan(TAG_ROW_Y + TAG_ROW_HEIGHT);
  });

  it('composites the modal at the native card size inside the 640x725 focus box', () => {
    const layout = computeCardModalLayout(640, 400);
    expect({ width: layout.nativeWidth, height: layout.nativeHeight }).toEqual({
      width: 768,
      height: 1024,
    });
    expect(layout.width).toBe(271.875);
    expect(layout.height).toBe(362.5);
    expect(layout.x).toBe(184);
    expect(layout.y).toBe(19);
    expect((layout.y * 2) % 1).toBe(0);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.y).toBeGreaterThanOrEqual(0);
    expect(layout.width / layout.height).toBeCloseTo(768 / 1024, 6);

    // At the 2x target the card reaches the focus box's full 725 height and
    // keeps its ratio, so 640x725 bounds the frame rather than stretching it.
    const hd = computeCardModalLayout(1280, 800);
    expect(hd.height).toBe(CARD_MODAL_BOX.height);
    expect(hd.width).toBe(543.75);
    expect(hd.width).toBeLessThanOrEqual(CARD_MODAL_BOX.width);
    expect(hd.width / hd.height).toBeCloseTo(768 / 1024, 6);
  });
});

describe('card drag targeting', () => {
  const targets = [
    { id: 'WHO', bounds: { x: 12, y: 250, width: 99, height: 26 } },
    { id: 'WHEN', bounds: { x: 115, y: 250, width: 99, height: 26 } },
  ] as const;

  it('resolves the tag chip under the pointer, inclusive of its edges', () => {
    expect(findCardDropTarget({ x: 60, y: 260 }, targets)?.id).toBe('WHO');
    expect(findCardDropTarget({ x: 12, y: 250 }, targets)?.id).toBe('WHO');
    expect(findCardDropTarget({ x: 111, y: 276 }, targets)?.id).toBe('WHO');
    expect(findCardDropTarget({ x: 160, y: 260 }, targets)?.id).toBe('WHEN');
    expect(findCardDropTarget({ x: 160, y: 300 }, targets)).toBeUndefined();
    expect(findCardDropTarget({ x: 0, y: 0 }, [])).toBeUndefined();
  });

  it('stipples the drag link into alternating dashes along a bowed curve', () => {
    const segments = dottedLinkSegments({ x: 0, y: 0 }, { x: 100, y: 0 }, {
      dashLength: 6,
      gapLength: 4,
      samples: 100,
    });
    expect(segments.length).toBeGreaterThan(5);
    expect(segments[0]?.from).toEqual({ x: 0, y: 0 });
    for (const segment of segments) {
      expect(segment.to.x).toBeGreaterThan(segment.from.x);
      expect(segment.to.x - segment.from.x).toBeLessThanOrEqual(8);
    }
    expect(segments.at(-1)?.to.x).toBeLessThanOrEqual(100);

    expect(dottedLinkControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toEqual({ x: 50, y: 0 });
    expect(dottedLinkControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, -20)).toEqual({ x: 50, y: -20 });
    expect(dottedLinkControlPoint({ x: 7, y: 9 }, { x: 7, y: 9 }, 30)).toEqual({ x: 7, y: 9 });
  });
});
