import type { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer() as Container & { text: string; tint: number };
      Object.defineProperties(view, {
        anchor: { value: { set: () => undefined } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import {
  JUDGMENT_BANNER_BOUNDS,
  JUDGMENT_BANNER_FONT_SIZE,
  JUDGMENT_TONE_COLOURS,
  createJudgmentBanner,
  ellipsizeToWidth,
  pixelTextAdvance,
} from '../../src/ui/screens/interrogation/judgmentBanner';
import { JUDGMENT_FEEDBACK_TONES } from '../../src/ui/screens/interrogation/model';
import { UI_PALETTE } from '../../src/ui/widgets/theme';

function feedback(overrides: Partial<{ tone: 'CONTRADICTION'; text: string }> = {}) {
  return {
    tone: 'CONTRADICTION' as const,
    headline: '직접 모순',
    statementQuote: '동쪽 공터에 있었다',
    evidenceQuote: '서쪽 창고 열쇠',
    detail: '증거가 진술을 정면으로 무너뜨렸다.',
    text: '진술 "동쪽 공터에 있었다" ↔ 증거 서쪽 창고 열쇠 · 직접 모순',
    ...overrides,
  };
}

describe('judgment banner geometry', () => {
  it('occupies the strip between the tag row and the statement box', () => {
    expect(JUDGMENT_BANNER_BOUNDS).toEqual({ x: 6, y: 276, width: 628, height: 11 });
    // Tag chips end at y 276; the statement box's 2px top border is centred on
    // y 288, so it owns rows 287..289 and the banner must stop before them.
    expect(JUDGMENT_BANNER_BOUNDS.y).toBeGreaterThanOrEqual(250 + 26);
    expect(JUDGMENT_BANNER_BOUNDS.y + JUDGMENT_BANNER_BOUNDS.height).toBeLessThanOrEqual(287);
    expect(JUDGMENT_BANNER_BOUNDS.x + JUDGMENT_BANNER_BOUNDS.width).toBeLessThanOrEqual(640);
  });

  it('maps each tone to a distinct palette colour', () => {
    expect(JUDGMENT_TONE_COLOURS).toEqual({
      CONTRADICTION: UI_PALETTE.red,
      SUPPORT: UI_PALETTE.green,
      MISS: UI_PALETTE.amber,
      INVALID: UI_PALETTE.muted,
    });
    expect(new Set(Object.values(JUDGMENT_TONE_COLOURS)).size).toBe(
      JUDGMENT_FEEDBACK_TONES.length,
    );
  });
});

describe('single-line ellipsis budget', () => {
  it('charges Hangul a full em and ASCII a half em', () => {
    expect(pixelTextAdvance('가나다', 8)).toBe(24);
    expect(pixelTextAdvance('abcd', 8)).toBe(16);
    expect(pixelTextAdvance('가a', 8)).toBe(12);
    expect(pixelTextAdvance('', 8)).toBe(0);
  });

  it('keeps text that fits and clips the tail of text that does not', () => {
    expect(ellipsizeToWidth('가나다', 100, 8)).toBe('가나다');
    const clipped = ellipsizeToWidth('가나다라마바사아자차', 40, 8);
    expect(clipped.endsWith('…')).toBe(true);
    expect(pixelTextAdvance(clipped, 8)).toBeLessThanOrEqual(40);
    expect(clipped.length).toBeLessThan('가나다라마바사아자차'.length);
  });

  it('degrades to a bare ellipsis or an empty string at impossible widths', () => {
    expect(ellipsizeToWidth('가나다', 4, 8)).toBe('…');
    expect(ellipsizeToWidth('가나다', 0, 8)).toBe('');
    expect(ellipsizeToWidth('가나다', -10, 8)).toBe('');
  });
});

describe('judgment banner controller', () => {
  it('starts hidden and non-interactive so it never eats a card drag', () => {
    const banner = createJudgmentBanner();

    expect(banner.visible).toBe(false);
    expect(banner.text).toBe('');
    expect(banner.view.eventMode).toBe('none');
    expect(banner.view.position).toMatchObject({ x: 6, y: 276 });

    banner.view.destroy({ children: true });
  });

  it('shows the assembled line and clears back to hidden', () => {
    const banner = createJudgmentBanner();

    banner.show(feedback());
    expect(banner.visible).toBe(true);
    expect(banner.text).toBe(feedback().text);

    banner.clear();
    expect(banner.visible).toBe(false);
    expect(banner.text).toBe('');

    banner.view.destroy({ children: true });
  });

  it('ellipsizes an overlong line to the banner width', () => {
    const banner = createJudgmentBanner();
    const long = '가'.repeat(300);

    banner.show(feedback({ text: long }));

    expect(banner.text.endsWith('…')).toBe(true);
    expect(
      pixelTextAdvance(banner.text, JUDGMENT_BANNER_FONT_SIZE),
    ).toBeLessThanOrEqual(JUDGMENT_BANNER_BOUNDS.width - 12);

    banner.view.destroy({ children: true });
  });
});
