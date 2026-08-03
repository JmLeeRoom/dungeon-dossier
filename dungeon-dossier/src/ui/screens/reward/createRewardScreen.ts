import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import { assertRewardScreenModel, type RewardScreenModel } from './model';

export function createRewardScreen(
  model: RewardScreenModel,
  onSelect: (rewardId: string) => void,
): Container {
  assertRewardScreenModel(model);
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));
  const heading = createPixelText(model.heading, { fontSize: 15, fill: UI_PALETTE.paper });
  heading.anchor.set(0.5, 0);
  heading.position.set(320, 32);
  const gradePlate = new Graphics().roundRect(522, 24, 78, 78, 3).fill(UI_PALETTE.panel).stroke({ color: UI_PALETTE.red, width: 3 });
  const grade = createPixelText(model.grade, { fontSize: 42, fill: UI_PALETTE.red });
  grade.anchor.set(0.5);
  grade.position.set(561, 63);
  view.addChild(heading, gradePlate, grade);
  const width = model.choices.length === 3 ? 168 : 218;
  const gap = 18;
  const total = width * model.choices.length + gap * (model.choices.length - 1);
  model.choices.forEach((choice, index) => {
    const card = new Container();
    card.position.set((640 - total) / 2 + index * (width + gap), 124);
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.addChild(new Graphics().roundRect(0, 0, width, 220, 4).fill(UI_PALETTE.panel).stroke({ color: UI_PALETTE.parchmentDark, width: 2 }));
    const rarity = createPixelText(choice.rarity, { fontSize: 8, fill: UI_PALETTE.amber });
    rarity.position.set(12, 12);
    const title = createPixelText(choice.title, { fontSize: 11, fill: UI_PALETTE.paper, wordWrap: true, wordWrapWidth: width - 24, align: 'center' });
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, 52);
    const description = createPixelText(choice.description, { fontSize: 8, fill: UI_PALETTE.parchment, wordWrap: true, wordWrapWidth: width - 28, lineHeight: 11, align: 'center' });
    description.anchor.set(0.5, 0);
    description.position.set(width / 2, 96);
    const choose = createPixelText('선택', { fontSize: 10, fill: UI_PALETTE.cyan });
    choose.anchor.set(0.5);
    choose.position.set(width / 2, 194);
    card.addChild(rarity, title, description, choose);
    card.on('pointertap', () => onSelect(choice.rewardId));
    view.addChild(card);
  });
  return view;
}
