import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface GaugeDisplayModel {
  readonly value: number;
  readonly max: number;
  readonly ratio: number;
  readonly filledCells: number;
  readonly cellCount: number;
  readonly sweetSpot: Readonly<{ fromRatio: number; toRatio: number }> | undefined;
}

export function buildGaugeDisplayModel(
  value: number,
  max: number,
  options: Readonly<{ cellCount?: number; sweetSpotUnlocked?: boolean }> = {},
): GaugeDisplayModel {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeValue = Math.min(safeMax, Math.max(0, Number.isFinite(value) ? value : 0));
  const cellCount = Math.max(1, Math.round(options.cellCount ?? 10));
  const ratio = safeValue / safeMax;
  return {
    value: safeValue,
    max: safeMax,
    ratio,
    filledCells: Math.round(ratio * cellCount),
    cellCount,
    sweetSpot:
      options.sweetSpotUnlocked === true
        ? { fromRatio: 0.01, toRatio: 0.3 }
        : undefined,
  };
}

export interface GaugeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fill?: number;
  readonly sweetSpotUnlocked?: boolean;
  readonly label?: string;
  readonly cellCount?: number;
}

export function createGauge(value: number, max: number, options: GaugeOptions = {}): Container {
  const width = options.width ?? 120;
  const height = options.height ?? 12;
  const model = buildGaugeDisplayModel(value, max, {
    ...(options.cellCount === undefined ? {} : { cellCount: options.cellCount }),
    ...(options.sweetSpotUnlocked === undefined
      ? {}
      : { sweetSpotUnlocked: options.sweetSpotUnlocked }),
  });
  const view = new Container();
  const labelWidth = options.label === undefined ? 0 : 39;
  if (options.label !== undefined) {
    const label = createPixelText(options.label, { fontSize: 8, fill: UI_PALETTE.parchment });
    label.position.set(0, 2);
    view.addChild(label);
  }
  const barX = labelWidth;
  const barWidth = width - labelWidth;
  const graphics = new Graphics().rect(barX, 0, barWidth, height).fill(UI_PALETTE.deepInk);
  const gap = 1;
  const cellWidth = (barWidth - (model.cellCount + 1) * gap) / model.cellCount;
  for (let index = 0; index < model.cellCount; index += 1) {
    graphics
      .rect(barX + gap + index * (cellWidth + gap), 2, cellWidth, height - 4)
      .fill(index < model.filledCells ? (options.fill ?? UI_PALETTE.cyan) : UI_PALETTE.panelLight);
  }
  graphics.rect(barX, 0, barWidth, height).stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
  if (model.sweetSpot !== undefined) {
    const notchX = barX + Math.round(barWidth * model.sweetSpot.toRatio);
    const notchFrom = barX + Math.max(1, Math.round(barWidth * model.sweetSpot.fromRatio));
    graphics
      .moveTo(notchFrom, height - 1)
      .lineTo(notchX, height - 1)
      .stroke({ color: UI_PALETTE.amber, width: 2 })
      .moveTo(notchX, 0)
      .lineTo(notchX, 3)
      .stroke({ color: UI_PALETTE.amber, width: 1 });
  }
  view.addChild(graphics);
  return view;
}

export function coercionWarningSlipCount(coercion: number, limit: number): number {
  if (!Number.isFinite(coercion) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(5, Math.max(0, Math.floor((coercion / limit) * 5)));
}
