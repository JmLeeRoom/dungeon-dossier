import { Container, Graphics, Sprite } from 'pixi.js';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface PortraitPartsBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_PORTRAIT_PARTS_BOUNDS: PortraitPartsBounds = {
  x: 50,
  y: 44,
  width: 96,
  height: 40,
};

export interface PortraitOptions {
  readonly width?: number;
  readonly height?: number;
  readonly baseUrl?: string;
  readonly partsUrl?: string;
  readonly label?: string;
  readonly partsBounds?: PortraitPartsBounds;
}

export function createPortrait(options: PortraitOptions = {}): Container {
  const width = options.width ?? 196;
  const height = options.height ?? 216;
  const parts = options.partsBounds ?? DEFAULT_PORTRAIT_PARTS_BOUNDS;
  const view = new Container();
  const placeholder = new Graphics()
    .rect(0, 0, width, height)
    .fill(UI_PALETTE.panel)
    .stroke({ color: UI_PALETTE.panelLight, width: 1 })
    .ellipse(width / 2, 69, 36, 45)
    .fill(UI_PALETTE.parchmentDark)
    .poly([width / 2, 105, width - 28, height, 28, height])
    .fill(UI_PALETTE.panelLight);
  view.addChild(placeholder);

  if (options.baseUrl !== undefined) {
    const base = Sprite.from(options.baseUrl);
    base.width = width;
    base.height = height;
    view.addChild(base);
  }
  if (options.partsUrl !== undefined) {
    const expression = Sprite.from(options.partsUrl);
    expression.position.set(parts.x, parts.y);
    expression.width = parts.width;
    expression.height = parts.height;
    view.addChild(expression);
  }
  const label = createPixelText(options.label ?? 'ASSET PENDING', {
    fontSize: 8,
    fill: UI_PALETTE.paper,
  });
  label.anchor.set(0.5, 1);
  label.position.set(width / 2, height - 5);
  view.addChild(label);
  return view;
}

export function createPartnerPortrait(label: string, assetUrl?: string): Container {
  const view = createPortrait({ width: 72, height: 88, label, ...(assetUrl ? { baseUrl: assetUrl } : {}) });
  return view;
}
