import { Container, Graphics, Sprite } from 'pixi.js';
import { ASSET_DIMENSIONS, type AssetDimension } from '../../core/assetDimensions';
import { containImage, type FitBox } from '../../core/imageFit';
import { createPixelText } from '../../core/pixelText';
import type { AssetResolveContext } from '../../core/uiAssetPort';
import { createProfilePhoto } from '../../widgets/suspectPortraitWidget';
import { UI_PALETTE } from '../../widgets/theme';
import type {
  EpisodeNodeView,
  EpisodeSlotRole,
  RunStripNodeKind,
  RunStripScreenModel,
} from './model';

export interface StripAssetLookup {
  resolveUrl(key: string): string | undefined;
  resolveOptionalUrl?(key: string): string | undefined;
  resolveRequiredUrl?(key: string, context: AssetResolveContext): string;
}

export interface RunStripScreenOptions {
  readonly onContinue?: () => void;
  readonly assets?: StripAssetLookup;
}

/**
 * Board art the renderer owns outright. The generic marker is a renderer
 * constant precisely so a VEILED slot needs no key of its own: the model has
 * nothing to redact because it never carried anything.
 */
export const BOARD_BACKGROUND_ASSET_KEY = 'bg/event/crazyboard';
export const BOARD_VEILED_MARKER_ASSET_KEY = 'ui/board/event';
export const BOARD_PIN_ASSET_KEY = 'ui/pin/00';
export const BOARD_DETECTIVE_PHOTO_ASSET_KEY = 'ui/photo/teahoon';
export const BOARD_PARTNER_PHOTO_ASSET_KEY = 'ui/photo/mulkung';

function requiredUrl(
  assets: StripAssetLookup | undefined,
  key: string,
  contentId: string,
  slotId: string,
): string | undefined {
  if (assets === undefined) return undefined;
  return assets.resolveRequiredUrl?.(key, {
    screen: 'run-strip',
    contentId,
    slotId,
    bundle: 'board',
  }) ?? assets.resolveOptionalUrl?.(key) ?? assets.resolveUrl(key);
}

/** A decoration sprite: fitted, never stretched, and never a hit target. */
function decorate(url: string, source: AssetDimension, box: FitBox): Sprite {
  const rect = containImage(source, box);
  const sprite = Sprite.from(url);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width;
  sprite.height = rect.height;
  sprite.eventMode = 'none';
  return sprite;
}

const KIND_COLORS: Readonly<Record<RunStripNodeKind, number>> = {
  ENCOUNTER: UI_PALETTE.cyan,
  EVENT: UI_PALETTE.amber,
  BOSS: UI_PALETTE.red,
};

const ROLE_LABELS: Readonly<Record<EpisodeSlotRole, string>> = {
  COMBAT: '심문',
  EVENT: '조사',
  BOSS: '보스',
};

/** Focused board geometry in the 640x400 grid. Three stages, generously sized. */
const CARD_WIDTH = 148;
const CARD_HEIGHT = 128;
const CARD_GAP = 26;
const BOARD_TOP = 128;
const BOARD_LEFT = Math.round((640 - (CARD_WIDTH * 3 + CARD_GAP * 2)) / 2);

export const RUN_STRIP_STAGE_SIZE = { width: 640, height: 400 } as const;

/**
 * Decorative case-file portraits live in the right gutter, never on top of a
 * node card. Keeping the complete rectangles in one exported table lets the
 * renderer and its geometry regression test share the same source of truth.
 */
export const CASE_FILE_PHOTO_LAYOUT = [
  {
    key: BOARD_DETECTIVE_PHOTO_ASSET_KEY,
    caption: '김태훈 형사',
    x: 584,
    y: 92,
    width: 46,
    height: 46,
  },
  {
    key: BOARD_PARTNER_PHOTO_ASSET_KEY,
    caption: '김 인턴',
    x: 584,
    y: 150,
    width: 46,
    height: 46,
  },
] as const;

export function episodeSlotX(slotIndex: number): number {
  return BOARD_LEFT + slotIndex * (CARD_WIDTH + CARD_GAP);
}

function drawConnector(view: Container, slotIndex: number, dim: boolean): void {
  const x = episodeSlotX(slotIndex) + CARD_WIDTH;
  const y = BOARD_TOP + Math.round(CARD_HEIGHT / 2);
  view.addChild(
    new Graphics()
      .moveTo(x + 4, y)
      .lineTo(x + CARD_GAP - 4, y)
      .stroke({ color: dim ? UI_PALETTE.panelLight : UI_PALETTE.parchmentDark, width: 2 }),
  );
}

/** The veil: same silhouette, no content. A question mark stands in for the stage. */
function createFogOverlay(
  role: EpisodeSlotRole,
  assets: StripAssetLookup | undefined,
): Container {
  const node = new Container();
  node.addChild(
    new Graphics()
      .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 8)
      .fill({ color: UI_PALETTE.panel, alpha: 0.92 })
      .stroke({ color: UI_PALETTE.panelLight, width: 1 }),
  );
  // One generic marker for every veiled slot. It is chosen by the renderer, not
  // supplied per node, so no future node's identity reaches this code path.
  const markerUrl = requiredUrl(
    assets,
    BOARD_VEILED_MARKER_ASSET_KEY,
    `veiled-${role.toLowerCase()}`,
    'veiled-marker',
  );
  if (markerUrl !== undefined) {
    node.addChild(
      decorate(markerUrl, ASSET_DIMENSIONS.board_marker_1024, {
        x: 24,
        y: 10,
        width: CARD_WIDTH - 48,
        height: CARD_HEIGHT - 44,
      }),
    );
  }
  // Drifting banks, drawn as flat pixel bars so nothing needs a texture.
  for (let band = 0; band < 4; band += 1) {
    const inset = 12 + band * 9;
    node.addChild(
      new Graphics()
        .roundRect(10, inset + 22, CARD_WIDTH - 20 - band * 6, 7, 3)
        .fill({ color: UI_PALETTE.panelLight, alpha: 0.42 - band * 0.07 }),
    );
  }
  const mark = createPixelText('?', { fontSize: 28, fill: UI_PALETTE.muted });
  mark.anchor.set(0.5);
  mark.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2 - 6);
  const role_ = createPixelText(ROLE_LABELS[role], { fontSize: 8, fill: UI_PALETTE.muted });
  role_.anchor.set(0.5);
  role_.position.set(CARD_WIDTH / 2, CARD_HEIGHT - 22);
  node.addChild(mark, role_);
  return node;
}

function createKnownNode(
  node: Extract<EpisodeNodeView, { visibility: 'KNOWN' }>,
  assets: StripAssetLookup | undefined,
): Container {
  const container = new Container();
  const color = KIND_COLORS[node.kind];
  const current = node.status === 'CURRENT';
  container.addChild(
    new Graphics()
      .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, node.kind === 'BOSS' ? 2 : 8)
      .fill({ color: UI_PALETTE.panel, alpha: current ? 1 : 0.85 })
      .stroke({ color, width: current ? 3 : 1 }),
  );

  const photoUrl =
    node.artAssetKey === undefined
      ? undefined
      : requiredUrl(assets, node.artAssetKey, node.nodeId, 'node-photo');
  if (photoUrl !== undefined) {
    container.addChild(
      decorate(photoUrl, ASSET_DIMENSIONS.photo_256, {
        x: CARD_WIDTH / 2 - 30,
        y: 30,
        width: 60,
        height: 60,
      }),
    );
  }
  const pinUrl = requiredUrl(assets, BOARD_PIN_ASSET_KEY, node.nodeId, 'node-pin');
  if (pinUrl !== undefined) {
    // Decoration above the card: it changes nothing about the card's bounds or
    // its place in the input order.
    container.addChild(
      decorate(pinUrl, ASSET_DIMENSIONS.pin_128, {
        x: CARD_WIDTH / 2 - 9,
        y: -6,
        width: 18,
        height: 18,
      }),
    );
  }

  const roleBadge = createPixelText(ROLE_LABELS[node.role], {
    fontSize: 8,
    fill: current ? UI_PALETTE.ink : color,
  });
  roleBadge.anchor.set(0.5);
  roleBadge.position.set(CARD_WIDTH / 2, 18);
  container.addChild(
    new Graphics()
      .roundRect(CARD_WIDTH / 2 - 26, 9, 52, 18, 2)
      .fill(current ? color : UI_PALETTE.deepInk),
    roleBadge,
  );

  const label = createPixelText(node.label, {
    fontSize: 9,
    fill: node.status === 'CLEARED' ? UI_PALETTE.muted : UI_PALETTE.paper,
    wordWrap: true,
    wordWrapWidth: CARD_WIDTH - 20,
    align: 'center',
  });
  label.anchor.set(0.5, 0);
  label.position.set(CARD_WIDTH / 2, 46);
  container.addChild(label);

  if (node.status === 'CLEARED') {
    const stamp = createPixelText('완료', { fontSize: 11, fill: UI_PALETTE.red });
    stamp.anchor.set(0.5);
    stamp.rotation = -0.18;
    stamp.position.set(CARD_WIDTH / 2, CARD_HEIGHT - 26);
    container.addChild(stamp);
  }
  if (current) {
    const marker = createPixelText('▶ 진행 중', { fontSize: 8, fill: color });
    marker.anchor.set(0.5);
    marker.position.set(CARD_WIDTH / 2, CARD_HEIGHT - 20);
    container.addChild(marker);
  }
  return container;
}

/**
 * The detective's own file card and his partner's, pinned to the corkboard.
 * They are decoration: the board's three stages remain the only interactive
 * elements.
 */
function addCaseFilePhotos(view: Container, assets: StripAssetLookup | undefined): void {
  CASE_FILE_PHOTO_LAYOUT.forEach((entry) => {
    const url = requiredUrl(assets, entry.key, entry.caption, 'case-file-photo');
    if (url === undefined) return;
    const pinUrl = requiredUrl(assets, BOARD_PIN_ASSET_KEY, entry.caption, 'case-file-pin');
    const photo = createProfilePhoto({
      url,
      caption: entry.caption,
      width: entry.width,
      height: entry.height,
      ...(pinUrl === undefined ? {} : { pinUrl }),
    });
    photo.position.set(entry.x, entry.y);
    view.addChild(photo);
  });
}

export function createRunStripScreen(
  model: RunStripScreenModel,
  options: RunStripScreenOptions = {},
): Container {
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));
  const boardUrl = requiredUrl(
    options.assets,
    BOARD_BACKGROUND_ASSET_KEY,
    model.episodeId,
    'background',
  );
  if (boardUrl !== undefined) {
    // 1280x800 at exactly half size: the board fills the stage without any
    // fractional sampling, and the card coordinates below are unchanged.
    const board = Sprite.from(boardUrl);
    board.width = 640;
    board.height = 400;
    board.eventMode = 'none';
    view.addChild(board);
  }

  const title = createPixelText(model.title, { fontSize: 16, fill: UI_PALETTE.paper });
  title.anchor.set(0.5, 0);
  title.position.set(320, 26);
  view.addChild(title);

  const episodeHeading = createPixelText(
    `EPISODE ${model.episodeDisplayIndex.toString().padStart(2, '0')} / ` +
      `${model.episodeCount.toString().padStart(2, '0')}  ·  ${model.episodeLabel}`,
    { fontSize: 10, fill: UI_PALETTE.amber },
  );
  episodeHeading.anchor.set(0.5, 0);
  episodeHeading.position.set(320, 52);
  view.addChild(episodeHeading);

  const stageLine = createPixelText('심문 ▸ 조사 ▸ 보스', {
    fontSize: 8,
    fill: UI_PALETTE.muted,
  });
  stageLine.anchor.set(0.5, 0);
  stageLine.position.set(320, 70);
  view.addChild(stageLine);

  model.nodes.forEach((node, index) => {
    if (index < model.nodes.length - 1) {
      drawConnector(view, index, index >= model.activeSlotIndex);
    }
    const child = node.visibility === 'VEILED'
      ? createFogOverlay(node.role, options.assets)
      : createKnownNode(node, options.assets);
    child.position.set(episodeSlotX(index), BOARD_TOP);
    view.addChild(child);
  });

  // Cleared episodes shrink to stamps; they are history, not navigation.
  model.clearedEpisodes.forEach((episode, index) => {
    const stamp = createPixelText(`✔ ${episode.label}`, {
      fontSize: 8,
      fill: UI_PALETTE.green,
    });
    stamp.position.set(18, 300 + index * 14);
    view.addChild(stamp);
  });

  if (model.nextEpisodeVeiled) {
    const veil = new Container();
    veil.position.set(486, 296);
    veil.addChild(
      new Graphics()
        .roundRect(0, 0, 136, 40, 6)
        .fill({ color: UI_PALETTE.panel, alpha: 0.75 })
        .stroke({ color: UI_PALETTE.panelLight, width: 1 }),
    );
    const mark = createPixelText('? ? ?', { fontSize: 12, fill: UI_PALETTE.muted });
    mark.anchor.set(0.5);
    mark.position.set(68, 15);
    const caption = createPixelText('다음 에피소드', { fontSize: 7, fill: UI_PALETTE.muted });
    caption.anchor.set(0.5);
    caption.position.set(68, 30);
    veil.addChild(mark, caption);
    view.addChild(veil);
  }

  addCaseFilePhotos(view, options.assets);

  if (options.onContinue !== undefined) {
    const button = new Container();
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.position.set(258, 354);
    button.addChild(new Graphics().rect(0, 0, 124, 26).fill(UI_PALETTE.panelLight).stroke({
      color: UI_PALETTE.parchmentDark,
      width: 1,
    }));
    const label = createPixelText('다음 기록으로', { fontSize: 9, fill: UI_PALETTE.paper });
    label.anchor.set(0.5);
    label.position.set(62, 13);
    button.addChild(label);
    button.on('pointertap', options.onContinue);
    view.addChild(button);
  }
  return view;
}
