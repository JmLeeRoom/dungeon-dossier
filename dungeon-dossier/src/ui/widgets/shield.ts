import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface ShieldDisplayModel {
  readonly visible: boolean;
  readonly resistance: number;
  readonly durabilityLabel: string;
}

/** The resistance number is deliberately the widget's only game input. */
export function buildShieldDisplayModel(resistance: number): ShieldDisplayModel {
  const safeResistance = Number.isFinite(resistance) ? Math.max(0, Math.round(resistance)) : 0;
  return {
    visible: safeResistance > 0,
    resistance: safeResistance,
    durabilityLabel: safeResistance.toString(),
  };
}

export function createShield(resistance: number): Container {
  const model = buildShieldDisplayModel(resistance);
  const view = new Container();
  view.visible = model.visible;
  const shape = new Graphics()
    .poly([6, 0, 12, 3, 11, 10, 6, 14, 1, 10, 0, 3])
    .fill(UI_PALETTE.paper)
    .stroke({ color: UI_PALETTE.blue, width: 1 });
  const label = createPixelText(model.durabilityLabel, {
    fontSize: 7,
    fill: UI_PALETTE.ink,
  });
  label.anchor.set(0.5);
  label.position.set(6, 6);
  view.addChild(shape, label);
  return view;
}
