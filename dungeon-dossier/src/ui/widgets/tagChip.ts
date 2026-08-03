import { Container, Graphics } from 'pixi.js';
import type { StatementTokenView } from '../../dto';
import { createPixelText } from '../core/pixelText';
import { FACET_LABELS, UI_PALETTE } from './theme';

export const TAG_CHIP_STATES = ['DEFAULT', 'SHIELDED', 'BROKEN', 'SHAKEN'] as const;
export type TagChipState = (typeof TAG_CHIP_STATES)[number];
export type PublicFacet = StatementTokenView['facet'];

const TAG_STATE_PRIORITY: Readonly<Record<TagChipState, number>> = {
  DEFAULT: 0,
  SHAKEN: 1,
  SHIELDED: 2,
  BROKEN: 3,
};

/**
 * Display-only projection. No UI state is stored on the claim and no truth
 * information participates in this mapping.
 */
export function deriveTagChipState(
  epistemic: StatementTokenView['epistemic'],
  presentation: StatementTokenView['presentation'],
): TagChipState {
  if (epistemic === 'REFUTED') return 'BROKEN';
  if (presentation === 'LOCKED' || presentation === 'COMPOUND') return 'SHIELDED';
  if (
    epistemic === 'SUSPECTED' ||
    epistemic === 'PROVISIONAL' ||
    epistemic === 'UNRESOLVED' ||
    presentation === 'DISTORTED' ||
    presentation === 'DUPLICATED'
  ) {
    return 'SHAKEN';
  }
  return 'DEFAULT';
}

export function deriveFacetTagChipState(
  facet: PublicFacet,
  tokens: readonly StatementTokenView[],
): TagChipState {
  return tokens
    .filter((token) => token.facet === facet && token.presentation !== 'HIDDEN')
    .map((token) => deriveTagChipState(token.epistemic, token.presentation))
    .reduce<TagChipState>(
      (current, next) =>
        TAG_STATE_PRIORITY[next] > TAG_STATE_PRIORITY[current] ? next : current,
      'DEFAULT',
    );
}

export interface TagChipController {
  readonly view: Container;
  setSelected(selected: boolean): void;
  setState(state: TagChipState): void;
}

export interface TagChipOptions {
  readonly width?: number;
  readonly height?: number;
  readonly onSelect?: (facet: PublicFacet) => void;
}

const STATE_COLOURS: Readonly<
  Record<TagChipState, Readonly<{ fill: number; border: number; ink: number }>>
> = {
  DEFAULT: { fill: UI_PALETTE.parchmentDark, border: UI_PALETTE.panelLight, ink: UI_PALETTE.ink },
  SHIELDED: { fill: UI_PALETTE.blue, border: UI_PALETTE.cyan, ink: UI_PALETTE.paper },
  BROKEN: { fill: UI_PALETTE.red, border: UI_PALETTE.amber, ink: UI_PALETTE.paper },
  SHAKEN: { fill: UI_PALETTE.amber, border: UI_PALETTE.paper, ink: UI_PALETTE.ink },
};

export function createTagChip(
  facet: PublicFacet,
  initialState: TagChipState,
  options: TagChipOptions = {},
): TagChipController {
  const width = options.width ?? 98;
  const height = options.height ?? 26;
  const view = new Container();
  const plate = new Graphics();
  const stateMark = createPixelText('', { fontSize: 9 });
  const label = createPixelText(`${FACET_LABELS[facet]}  ${facet}`, {
    fontSize: 9,
    letterSpacing: 0,
  });
  label.position.set(9, 7);
  stateMark.position.set(width - 17, 7);
  view.addChild(plate, label, stateMark);

  let state = initialState;
  let selected = false;
  const redraw = (): void => {
    const colours = STATE_COLOURS[state];
    plate
      .clear()
      .poly([8, 0, width, 0, width, height, 8, height, 0, height / 2])
      .fill(colours.fill)
      .stroke({ color: selected ? UI_PALETTE.cyan : colours.border, width: selected ? 2 : 1 });
    label.tint = colours.ink;
    stateMark.tint = colours.ink;
    stateMark.text =
      state === 'SHIELDED' ? '◆' : state === 'BROKEN' ? '×' : state === 'SHAKEN' ? '!' : '';
  };
  redraw();

  if (options.onSelect !== undefined) {
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.on('pointertap', () => options.onSelect?.(facet));
  }

  return {
    view,
    setSelected(value): void {
      selected = value;
      redraw();
    },
    setState(value): void {
      state = value;
      redraw();
    },
  };
}
