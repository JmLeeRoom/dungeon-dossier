import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets';
import type { JudgmentFeedbackTone, JudgmentFeedbackView } from './model';

/**
 * One line in the gap between the tag row (ends at y 276) and the statement
 * box's top border (y 287), so it never paints over either.
 */
export const JUDGMENT_BANNER_BOUNDS = {
  x: 6,
  y: 276,
  width: 628,
  height: 11,
} as const;

export const JUDGMENT_BANNER_FONT_SIZE = 8;

export const JUDGMENT_TONE_COLOURS: Readonly<Record<JudgmentFeedbackTone, number>> = {
  CONTRADICTION: UI_PALETTE.red,
  SUPPORT: UI_PALETTE.green,
  MISS: UI_PALETTE.amber,
  INVALID: UI_PALETTE.muted,
};

const ELLIPSIS = '…';

/**
 * Galmuri11 renders Hangul and CJK at a full em and ASCII at a half em, so a
 * character-class walk is an exact-enough advance for a single-line guard.
 */
export function pixelTextAdvance(text: string, fontSize: number): number {
  let advance = 0;
  for (const glyph of text) {
    const codePoint = glyph.codePointAt(0) ?? 0;
    advance += codePoint > 0x0_2ff ? fontSize : fontSize / 2;
  }
  return advance;
}

/**
 * Trims to an ellipsis instead of scrolling: the banner is a status line, and
 * a clipped tail is more readable than a moving one.
 */
export function ellipsizeToWidth(
  text: string,
  maxWidth: number,
  fontSize: number = JUDGMENT_BANNER_FONT_SIZE,
): string {
  if (maxWidth <= 0) return '';
  if (pixelTextAdvance(text, fontSize) <= maxWidth) return text;
  const budget = maxWidth - pixelTextAdvance(ELLIPSIS, fontSize);
  if (budget <= 0) return ELLIPSIS;
  let kept = '';
  let advance = 0;
  for (const glyph of text) {
    const next = advance + pixelTextAdvance(glyph, fontSize);
    if (next > budget) break;
    kept += glyph;
    advance = next;
  }
  return `${kept}${ELLIPSIS}`;
}

export interface JudgmentBannerController {
  readonly view: Container;
  readonly visible: boolean;
  readonly text: string;
  show(feedback: JudgmentFeedbackView): void;
  clear(): void;
}

export interface JudgmentBannerOptions {
  readonly width?: number;
  readonly height?: number;
}

export function createJudgmentBanner(
  options: JudgmentBannerOptions = {},
): JudgmentBannerController {
  const width = options.width ?? JUDGMENT_BANNER_BOUNDS.width;
  const height = options.height ?? JUDGMENT_BANNER_BOUNDS.height;
  const view = new Container();
  view.position.set(JUDGMENT_BANNER_BOUNDS.x, JUDGMENT_BANNER_BOUNDS.y);
  view.visible = false;
  // Purely informational: it must never intercept a card drag crossing it.
  view.eventMode = 'none';

  const plate = new Graphics();
  const accent = new Graphics();
  const label = createPixelText('', {
    fontSize: JUDGMENT_BANNER_FONT_SIZE,
    fill: UI_PALETTE.paper,
  });
  label.position.set(6, 2);
  view.addChild(plate, accent, label);

  let text = '';

  const paint = (tone: JudgmentFeedbackTone): void => {
    const colour = JUDGMENT_TONE_COLOURS[tone];
    plate
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: UI_PALETTE.deepInk, alpha: 0.9 })
      .rect(0, 0, width, height)
      .stroke({ color: colour, width: 1 });
    accent.clear().rect(0, 0, 3, height).fill(colour);
    label.tint = colour === UI_PALETTE.muted ? UI_PALETTE.muted : UI_PALETTE.paper;
  };

  return {
    view,
    get visible(): boolean {
      return view.visible;
    },
    get text(): string {
      return text;
    },
    show(feedback): void {
      text = ellipsizeToWidth(feedback.text, width - 12, JUDGMENT_BANNER_FONT_SIZE);
      label.text = text;
      paint(feedback.tone);
      view.visible = true;
    },
    clear(): void {
      text = '';
      label.text = '';
      view.visible = false;
    },
  };
}
