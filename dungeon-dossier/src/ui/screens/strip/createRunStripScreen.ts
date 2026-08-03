import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import type { RunStripNodeKind, RunStripScreenModel } from './model';

export interface RunStripScreenOptions {
  readonly onContinue?: () => void;
}

const KIND_COLORS: Readonly<Record<RunStripNodeKind, number>> = {
  ENCOUNTER: UI_PALETTE.cyan,
  EVENT: UI_PALETTE.amber,
  BOSS: UI_PALETTE.red,
};

export function createRunStripScreen(
  model: RunStripScreenModel,
  options: RunStripScreenOptions = {},
): Container {
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));
  const title = createPixelText(model.title, { fontSize: 16, fill: UI_PALETTE.paper });
  title.anchor.set(0.5, 0);
  title.position.set(320, 38);
  view.addChild(title);

  model.nodes.forEach((node, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    const x = 54 + column * 133;
    const y = 104 + row * 82;
    if (index < model.nodes.length - 1 && column < 4) {
      view.addChild(new Graphics().moveTo(x + 28, y + 15).lineTo(x + 116, y + 15).stroke({
        color: node.status === 'LOCKED' ? UI_PALETTE.panelLight : UI_PALETTE.parchmentDark,
        width: 2,
      }));
    }
    const color = node.status === 'LOCKED' ? UI_PALETTE.panelLight : KIND_COLORS[node.kind];
    const icon = new Graphics()
      .roundRect(x, y, 30, 30, node.kind === 'BOSS' ? 2 : 8)
      .fill(node.status === 'CURRENT' ? color : UI_PALETTE.panel)
      .stroke({ color, width: node.status === 'CURRENT' ? 3 : 1 });
    const number = createPixelText((index + 1).toString().padStart(2, '0'), {
      fontSize: 8,
      fill: node.status === 'CURRENT' ? UI_PALETTE.ink : color,
    });
    number.anchor.set(0.5);
    number.position.set(x + 15, y + 15);
    const label = createPixelText(node.label, {
      fontSize: 7,
      fill: node.status === 'LOCKED' ? UI_PALETTE.muted : UI_PALETTE.paper,
      wordWrap: true,
      wordWrapWidth: 92,
      align: 'center',
    });
    label.anchor.set(0.5, 0);
    label.position.set(x + 15, y + 36);
    view.addChild(icon, number, label);
    if (node.status === 'CLEARED') {
      const stamp = createPixelText('완료', { fontSize: 8, fill: UI_PALETTE.red });
      stamp.rotation = -0.18;
      stamp.position.set(x + 4, y + 9);
      view.addChild(stamp);
    }
  });

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
