import { Container, Graphics, Sprite } from 'pixi.js';
import type { SuspectStatePart } from '../../dto';
import { ASSET_DIMENSIONS } from '../core/assetDimensions';
import { containImage } from '../core/imageFit';
import { createPixelText } from '../core/pixelText';
import { createPortrait, type PortraitController } from './portrait';
import { UI_PALETTE } from './theme';

/**
 * How a non-base state is composited.
 *
 * - `replace`: the state sheet *is* the whole character. Approved NHN art is
 *   authored this way, so drawing `upset` on top of `base` would show two
 *   overlapping characters.
 * - `overlay`: the state sheet is a difference layer over a shared body. The
 *   generated placeholder set is authored this way and still needs it.
 */
export const SUSPECT_STATE_MODES = ['replace', 'overlay'] as const;
export type SuspectStateMode = (typeof SUSPECT_STATE_MODES)[number];

/**
 * The three frames of one suspect, as asset keys. `base` is required because
 * every suspect must render something; `upset`/`lose` may be absent, in which
 * case the widget falls back to `base` plus the vector state wash.
 */
export interface SuspectAssetSet {
  readonly base: string;
  readonly upset?: string;
  readonly lose?: string;
  readonly stateMode: SuspectStateMode;
}

export interface SuspectPortraitOptions {
  readonly assetSet?: SuspectAssetSet;
  readonly statePart: SuspectStatePart;
  readonly resolveUrl?: (key: string) => string | undefined;
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
}

export type SuspectPortraitController = PortraitController;

export function suspectAssetKeyForState(
  assetSet: SuspectAssetSet,
  statePart: SuspectStatePart,
): string {
  if (statePart === 'base') return assetSet.base;
  return (statePart === 'upset' ? assetSet.upset : assetSet.lose) ?? assetSet.base;
}

/**
 * Resolves which sheets the portrait should composite for one state.
 *
 * In `replace` mode exactly one sheet is ever produced: the active state's own
 * frame becomes the base and there is no overlay, which is what keeps a state
 * change a swap rather than a stack. `overlay` reproduces the existing
 * placeholder behaviour untouched.
 */
export function resolveSuspectPortraitSheets(
  options: SuspectPortraitOptions,
): { readonly baseUrl?: string; readonly statePartsUrl?: string } {
  const { assetSet, statePart } = options;
  if (assetSet === undefined) return {};
  const resolve = options.resolveUrl ?? ((): undefined => undefined);

  if (assetSet.stateMode === 'replace') {
    const url = resolve(suspectAssetKeyForState(assetSet, statePart));
    return url === undefined ? {} : { baseUrl: url };
  }

  const baseUrl = resolve(assetSet.base);
  if (statePart === 'base') return baseUrl === undefined ? {} : { baseUrl };
  const stateKey = statePart === 'upset' ? assetSet.upset : assetSet.lose;
  const statePartsUrl = stateKey === undefined ? undefined : resolve(stateKey);
  return {
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(statePartsUrl === undefined ? {} : { statePartsUrl }),
  };
}

/**
 * The interrogation suspect. It owns one container for the lifetime of the
 * encounter so the damped left/right shake that punctuates a state change keeps
 * running across the swap instead of restarting on a fresh node.
 */
export function createSuspectPortrait(
  options: SuspectPortraitOptions,
): SuspectPortraitController {
  const sheets = resolveSuspectPortraitSheets(options);
  return createPortrait({
    statePart: options.statePart,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...sheets,
  });
}

/** Source size of the board and profile photographs. */
export const PROFILE_PHOTO_SOURCE = ASSET_DIMENSIONS.photo_256;
export const PROFILE_PHOTO_SIZE = { width: 48, height: 48 } as const;

export interface ProfilePhotoOptions {
  readonly url?: string;
  readonly caption?: string;
  readonly width?: number;
  readonly height?: number;
  /** Decorative pin sprite (`ui/pin/00`), drawn above the photo corner. */
  readonly pinUrl?: string;
}

/**
 * A pinned 256x256 photograph: the detective's own file card, the partner's,
 * and the board's known-suspect markers all use this one frame so they stay
 * visually consistent. Every child is `eventMode: 'none'` — a decoration must
 * never become a hit target or shift the input priority of what it sits on.
 */
export function createProfilePhoto(options: ProfilePhotoOptions = {}): Container {
  const width = options.width ?? PROFILE_PHOTO_SIZE.width;
  const height = options.height ?? PROFILE_PHOTO_SIZE.height;
  const view = new Container();
  view.eventMode = 'none';

  view.addChild(
    new Graphics()
      .rect(0, 0, width, height)
      .fill(UI_PALETTE.parchmentDark)
      .stroke({ color: UI_PALETTE.panelLight, width: 1 }),
  );

  if (options.url !== undefined) {
    const inset = 2;
    const rect = containImage(PROFILE_PHOTO_SOURCE, {
      x: inset,
      y: inset,
      width: width - inset * 2,
      height: height - inset * 2,
    });
    const photo = Sprite.from(options.url);
    photo.position.set(rect.x, rect.y);
    photo.width = rect.width;
    photo.height = rect.height;
    photo.eventMode = 'none';
    view.addChild(photo);
  }

  if (options.caption !== undefined && options.caption !== '') {
    const caption = createPixelText(options.caption, { fontSize: 7, fill: UI_PALETTE.ink });
    caption.anchor.set(0.5, 1);
    caption.position.set(width / 2, height - 1);
    caption.eventMode = 'none';
    view.addChild(caption);
  }

  if (options.pinUrl !== undefined) {
    const pin = Sprite.from(options.pinUrl);
    const pinSize = Math.max(6, Math.round(width * 0.26));
    pin.width = pinSize;
    pin.height = pinSize;
    pin.position.set(Math.round(width / 2 - pinSize / 2), -Math.round(pinSize * 0.4));
    pin.eventMode = 'none';
    view.addChild(pin);
  }

  return view;
}
