import { Container, Graphics, Sprite } from 'pixi.js';
import type { PartnerCooldownView, SuspectStatePart } from '../../dto';
import { ASSET_DIMENSIONS } from '../core/assetDimensions';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface SuspectStatePartsBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Display size of the 512x512 suspect frame inside the 640x400 layout grid. */
export const SUSPECT_PORTRAIT_SIZE = { width: 216, height: 216 } as const;
export const PARTNER_PORTRAIT_SIZE = { width: 88, height: 88 } as const;

/**
 * State parts are authored at the same 512x512 as the body, so they overlay the
 * portrait frame exactly instead of being pinned to a face rectangle.
 */
export const DEFAULT_SUSPECT_STATE_PARTS_BOUNDS: SuspectStatePartsBounds = {
  x: 0,
  y: 0,
  width: SUSPECT_PORTRAIT_SIZE.width,
  height: SUSPECT_PORTRAIT_SIZE.height,
};

export interface PortraitOptions {
  readonly width?: number;
  readonly height?: number;
  readonly baseUrl?: string;
  readonly statePartsUrl?: string;
  readonly label?: string;
  readonly statePartsBounds?: SuspectStatePartsBounds;
  readonly statePart?: SuspectStatePart;
}

export interface PortraitController {
  readonly view: Container;
  readonly statePart: SuspectStatePart;
}

const STATE_PART_TINTS: Readonly<Record<SuspectStatePart, number>> = {
  base: UI_PALETTE.parchmentDark,
  upset: UI_PALETTE.red,
  lose: UI_PALETTE.blue,
};

export function createPortrait(options: PortraitOptions = {}): Container {
  const width = options.width ?? SUSPECT_PORTRAIT_SIZE.width;
  const height = options.height ?? SUSPECT_PORTRAIT_SIZE.height;
  const statePart = options.statePart ?? 'base';
  const bounds = options.statePartsBounds ?? {
    ...DEFAULT_SUSPECT_STATE_PARTS_BOUNDS,
    width,
    height,
  };
  const view = new Container();
  const placeholder = new Graphics()
    .rect(0, 0, width, height)
    .fill(UI_PALETTE.panel)
    .stroke({ color: UI_PALETTE.panelLight, width: 1 })
    .ellipse(width / 2, height * 0.32, width * 0.18, height * 0.21)
    .fill(UI_PALETTE.parchmentDark)
    .poly([width / 2, height * 0.49, width - width * 0.14, height, width * 0.14, height])
    .fill(UI_PALETTE.panelLight);
  view.addChild(placeholder);

  if (options.baseUrl !== undefined) {
    const base = Sprite.from(options.baseUrl);
    base.width = width;
    base.height = height;
    view.addChild(base);
  }
  if (options.statePartsUrl !== undefined && statePart !== 'base') {
    const parts = Sprite.from(options.statePartsUrl);
    parts.position.set(bounds.x, bounds.y);
    parts.width = bounds.width;
    parts.height = bounds.height;
    view.addChild(parts);
  } else if (statePart !== 'base') {
    // Without art, the state still has to read on screen.
    const wash = new Graphics()
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .fill({ color: STATE_PART_TINTS[statePart], alpha: 0.28 });
    view.addChild(wash);
  }

  // Authored and generated base sheets already own their nameplate. Only the
  // vector fallback needs a label; drawing both makes the two captions collide.
  if (options.baseUrl === undefined) {
    const label = createPixelText(options.label ?? 'ASSET PENDING', {
      fontSize: 8,
      fill: UI_PALETTE.paper,
    });
    label.anchor.set(0.5, 1);
    label.position.set(width / 2, height - 5);
    view.addChild(label);
  }
  return view;
}

export interface PartnerPortraitOptions {
  readonly label: string;
  readonly baseUrl?: string;
  readonly usedUrl?: string;
  readonly cooldown?: PartnerCooldownView;
  readonly width?: number;
  readonly height?: number;
  readonly onUse?: () => void;
}

export interface PartnerPortraitController {
  readonly view: Container;
  readonly cooldown: PartnerCooldownView;
  setCooldown(state: PartnerCooldownView): void;
}

function normalizePartnerCooldown(state: PartnerCooldownView | undefined): PartnerCooldownView {
  const cooldownTurns = Number.isFinite(state?.cooldownTurns)
    ? Math.max(0, Math.floor(state?.cooldownTurns ?? 0))
    : 0;
  return state?.state === 'used' && cooldownTurns > 0
    ? { state: 'used', cooldownTurns }
    : { state: 'base', cooldownTurns: 0 };
}

/**
 * Renders the two 512x512 partner states. While on cooldown the portrait dims
 * and shows the remaining turn count so the skill's availability is readable
 * without a tooltip.
 */
export function createPartnerPortrait(
  options: PartnerPortraitOptions,
): PartnerPortraitController {
  const width = options.width ?? PARTNER_PORTRAIT_SIZE.width;
  const height = options.height ?? PARTNER_PORTRAIT_SIZE.height;
  let cooldown = normalizePartnerCooldown(options.cooldown);

  const view = new Container();
  const artwork = new Container();
  view.addChild(artwork);

  const basePortrait = createPortrait({
    width,
    height,
    label: options.label,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
  });
  const usedPortrait =
    options.usedUrl === undefined
      ? undefined
      : createPortrait({ width, height, label: options.label, baseUrl: options.usedUrl });
  artwork.addChild(basePortrait);
  if (usedPortrait !== undefined) artwork.addChild(usedPortrait);

  const dim = new Graphics()
    .rect(0, 0, width, height)
    .fill({ color: UI_PALETTE.deepInk, alpha: 0.62 });
  const countdown = createPixelText('', { fontSize: 24, fill: UI_PALETTE.paper });
  countdown.anchor.set(0.5);
  countdown.position.set(width / 2, height / 2);
  view.addChild(dim, countdown);

  const render = (): void => {
    const ready = cooldown.state === 'base';
    if (usedPortrait !== undefined) {
      basePortrait.visible = ready;
      usedPortrait.visible = !ready;
    }
    artwork.alpha = ready ? 1 : 0.7;
    dim.visible = !ready;
    countdown.visible = !ready;
    countdown.text = ready ? '' : String(cooldown.cooldownTurns);
    const interactive = ready && options.onUse !== undefined;
    view.eventMode = interactive ? 'static' : 'none';
    view.cursor = interactive ? 'pointer' : 'default';
  };
  view.on('pointertap', () => {
    if (cooldown.state === 'base') options.onUse?.();
  });
  render();

  return {
    view,
    get cooldown(): PartnerCooldownView {
      return cooldown;
    },
    setCooldown(state): void {
      cooldown = normalizePartnerCooldown(state);
      render();
    },
  };
}

/** Source dimensions the portrait pipeline authors against. */
export const PORTRAIT_SOURCE_DIMENSIONS = {
  base: ASSET_DIMENSIONS.suspect_base,
  stateParts: ASSET_DIMENSIONS.suspect_state_parts,
  partner: ASSET_DIMENSIONS.partner,
} as const;
