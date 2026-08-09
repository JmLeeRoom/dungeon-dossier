import { Container, Graphics, Sprite } from 'pixi.js';
import type { StatementTokenView } from '../../dto';
import { ASSET_DIMENSIONS } from '../core/assetDimensions';
import { createPixelText } from '../core/pixelText';
import { FACET_LABELS, UI_PALETTE } from './theme';

/**
 * The first four are derived from a claim's epistemic and presentation state.
 * The last two are display-only conditions the screen knows and the engine does
 * not: a facet with no public claim at all, and a facet the player cannot act
 * on this turn.
 */
export const TAG_CHIP_STATES = [
  'DEFAULT',
  'SHIELDED',
  'BROKEN',
  'SHAKEN',
  'HIDDEN_SLOT',
  'DEACTIVATED',
] as const;
export type TagChipState = (typeof TAG_CHIP_STATES)[number];
export type PublicFacet = StatementTokenView['facet'];

/** Source size of the authored tag plates. */
export const TAG_PLATE_SOURCE = ASSET_DIMENSIONS.tag_830x330;

/**
 * Aspect-true chip size. 830x330 is 2.515:1, so the authored plate needs 39px
 * of height at the 98px row width the desk layout allots it. The previous
 * 98x26 vector chip has no aspect-true equivalent and would squash the art.
 */
export const TAG_CHIP_SIZE = { width: 98, height: 39 } as const;

/**
 * Which plate each state draws. `SHAKEN` has no authored plate: the delivery
 * has no such art and `deactivate` means something else, so it keeps the vector
 * treatment rather than borrowing a plate that reads wrong.
 */
export const TAG_CHIP_ASSET_KEYS: Readonly<Record<TagChipState, string | undefined>> = {
  DEFAULT: 'ui/tag/base',
  SHIELDED: 'ui/tag/shield',
  BROKEN: 'ui/tag/broken',
  SHAKEN: undefined,
  HIDDEN_SLOT: 'ui/tag/hidden',
  DEACTIVATED: 'ui/tag/deactivate',
};

const TAG_STATE_PRIORITY: Readonly<Record<TagChipState, number>> = {
  HIDDEN_SLOT: -1,
  DEFAULT: 0,
  SHAKEN: 1,
  SHIELDED: 2,
  BROKEN: 3,
  DEACTIVATED: 4,
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

/**
 * A facet with no public token at all is an empty slot in the statement, not a
 * default one. `toPublicDTO` has already removed every HIDDEN claim, so the
 * only thing this reads is whether anything remains — the hidden claim's id and
 * wording never reach the UI and must not be reconstructible from this.
 */
export function deriveFacetTagChipState(
  facet: PublicFacet,
  tokens: readonly StatementTokenView[],
): TagChipState {
  const visible = tokens.filter(
    (token) => token.facet === facet && token.presentation !== 'HIDDEN',
  );
  if (visible.length === 0) return 'HIDDEN_SLOT';
  return visible
    .map((token) => deriveTagChipState(token.epistemic, token.presentation))
    .reduce<TagChipState>(
      (current, next) =>
        TAG_STATE_PRIORITY[next] > TAG_STATE_PRIORITY[current] ? next : current,
      'DEFAULT',
    );
}

/**
 * `DEACTIVATED` is a UI condition layered over whatever the claim state is: the
 * facet exists and may even be shielded, but nothing the player can do this
 * turn will reach it. It is deliberately not an engine enum.
 */
export function applyTagChipDeactivation(
  state: TagChipState,
  selectable: boolean,
): TagChipState {
  if (selectable) return state;
  return state === 'HIDDEN_SLOT' ? 'HIDDEN_SLOT' : 'DEACTIVATED';
}

export interface TagChipController {
  readonly view: Container;
  readonly state: TagChipState;
  setSelected(selected: boolean): void;
  setState(state: TagChipState): void;
}

export interface TagChipOptions {
  readonly width?: number;
  readonly height?: number;
  readonly onSelect?: (facet: PublicFacet) => void;
  /** Resolves `ui/tag/*`. Without it the chip keeps the vector treatment. */
  readonly resolveUrl?: (key: string) => string | undefined;
}

const STATE_COLOURS: Readonly<
  Record<TagChipState, Readonly<{ fill: number; border: number; ink: number }>>
> = {
  DEFAULT: { fill: UI_PALETTE.parchmentDark, border: UI_PALETTE.panelLight, ink: UI_PALETTE.ink },
  SHIELDED: { fill: UI_PALETTE.blue, border: UI_PALETTE.cyan, ink: UI_PALETTE.paper },
  BROKEN: { fill: UI_PALETTE.red, border: UI_PALETTE.amber, ink: UI_PALETTE.paper },
  SHAKEN: { fill: UI_PALETTE.amber, border: UI_PALETTE.paper, ink: UI_PALETTE.ink },
  HIDDEN_SLOT: { fill: UI_PALETTE.panel, border: UI_PALETTE.muted, ink: UI_PALETTE.muted },
  DEACTIVATED: { fill: UI_PALETTE.panel, border: UI_PALETTE.panelLight, ink: UI_PALETTE.muted },
};

const STATE_MARKS: Readonly<Record<TagChipState, string>> = {
  DEFAULT: '',
  SHIELDED: '◆',
  BROKEN: '×',
  SHAKEN: '!',
  HIDDEN_SLOT: '?',
  DEACTIVATED: '–',
};

export function createTagChip(
  facet: PublicFacet,
  initialState: TagChipState,
  options: TagChipOptions = {},
): TagChipController {
  const width = options.width ?? TAG_CHIP_SIZE.width;
  const height = options.height ?? TAG_CHIP_SIZE.height;
  const view = new Container();

  // One sprite per state, pre-built and toggled. Swapping visibility avoids
  // re-creating textures on every statement update, and the vector plate stays
  // underneath as the fallback for states with no authored art.
  const plate = new Graphics();
  const plates = new Map<TagChipState, Sprite>();
  view.addChild(plate);
  for (const state of TAG_CHIP_STATES) {
    const key = TAG_CHIP_ASSET_KEYS[state];
    const url = key === undefined ? undefined : options.resolveUrl?.(key);
    if (url === undefined) continue;
    const sprite = Sprite.from(url);
    sprite.width = width;
    sprite.height = height;
    sprite.visible = false;
    // Decoration only: the chip's own container owns the hit target.
    sprite.eventMode = 'none';
    plates.set(state, sprite);
    view.addChild(sprite);
  }

  const stateMark = createPixelText('', { fontSize: 9 });
  const label = createPixelText(`${FACET_LABELS[facet]}  ${facet}`, {
    fontSize: 9,
    letterSpacing: 0,
  });
  // The plate art carries a left-hand eyelet, so the copy starts clear of it.
  label.position.set(Math.round(width * 0.18), Math.round(height / 2 - 5));
  stateMark.position.set(width - 17, Math.round(height / 2 - 5));
  view.addChild(label, stateMark);

  let state = initialState;
  let selected = false;
  const redraw = (): void => {
    const colours = STATE_COLOURS[state];
    const sprite = plates.get(state);
    for (const [candidate, node] of plates) node.visible = candidate === state;

    plate.clear();
    if (sprite === undefined) {
      plate
        .poly([8, 0, width, 0, width, height, 8, height, 0, height / 2])
        .fill(colours.fill)
        .stroke({ color: selected ? UI_PALETTE.cyan : colours.border, width: selected ? 2 : 1 });
    } else if (selected) {
      // Selection stays a code layer so it reads identically on every plate.
      plate.rect(-1, -1, width + 2, height + 2).stroke({ color: UI_PALETTE.cyan, width: 2 });
    }

    label.tint = sprite === undefined ? colours.ink : UI_PALETTE.ink;
    label.alpha = state === 'HIDDEN_SLOT' || state === 'DEACTIVATED' ? 0.55 : 1;
    stateMark.tint = label.tint;
    stateMark.text = STATE_MARKS[state];
    const selectable =
      options.onSelect !== undefined && state !== 'HIDDEN_SLOT' && state !== 'DEACTIVATED';
    view.eventMode = selectable ? 'static' : 'none';
    view.cursor = selectable ? 'pointer' : 'default';
  };
  redraw();

  if (options.onSelect !== undefined) {
    view.on('pointertap', () => {
      if (state === 'HIDDEN_SLOT' || state === 'DEACTIVATED') return;
      options.onSelect?.(facet);
    });
  }

  return {
    view,
    get state(): TagChipState {
      return state;
    },
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
