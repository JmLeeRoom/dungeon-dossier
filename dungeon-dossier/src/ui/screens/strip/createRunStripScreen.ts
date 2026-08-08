import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import type {
  EpisodeNodeView,
  EpisodeSlotRole,
  RunStripNodeKind,
  RunStripScreenModel,
} from './model';

export interface RunStripScreenOptions {
  readonly onContinue?: () => void;
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
function createFogOverlay(role: EpisodeSlotRole): Container {
  const node = new Container();
  node.addChild(
    new Graphics()
      .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 8)
      .fill({ color: UI_PALETTE.panel, alpha: 0.92 })
      .stroke({ color: UI_PALETTE.panelLight, width: 1 }),
  );
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

function createKnownNode(node: Extract<EpisodeNodeView, { visibility: 'KNOWN' }>): Container {
  const container = new Container();
  const color = KIND_COLORS[node.kind];
  const current = node.status === 'CURRENT';
  container.addChild(
    new Graphics()
      .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, node.kind === 'BOSS' ? 2 : 8)
      .fill({ color: UI_PALETTE.panel, alpha: current ? 1 : 0.85 })
      .stroke({ color, width: current ? 3 : 1 }),
  );

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

export function createRunStripScreen(
  model: RunStripScreenModel,
  options: RunStripScreenOptions = {},
): Container {
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));

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
      ? createFogOverlay(node.role)
      : createKnownNode(node);
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
