import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { InterrogationAssetLookup } from '../interrogation';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import { endingTone, type EndingScreenModel } from './model';

export function createEndingScreen(
  model: EndingScreenModel,
  assets?: InterrogationAssetLookup,
  onFinish?: () => void,
): Container {
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));
  const url = model.illustrationAssetKey === undefined ? undefined : assets?.resolveUrl(model.illustrationAssetKey);
  if (url !== undefined) {
    const image = new Sprite(Texture.from(url));
    image.width = 640;
    image.height = 240;
    image.alpha = 0.6;
    view.addChild(image);
  }
  const title = createPixelText(model.title, { fontSize: 20, fill: model.kind === 'BAD' ? UI_PALETTE.red : UI_PALETTE.paper });
  title.anchor.set(0.5, 0);
  title.position.set(320, 38);
  const tone = createPixelText(endingTone(model.kind), { fontSize: 10, fill: UI_PALETTE.cyan });
  tone.anchor.set(0.5, 0);
  tone.position.set(320, 82);
  const script = createPixelText(model.script.join('\n\n'), { fontSize: 10, fill: UI_PALETTE.parchment, wordWrap: true, wordWrapWidth: 500, lineHeight: 15, align: 'center' });
  script.anchor.set(0.5, 0);
  script.position.set(320, 132);
  view.addChild(title, tone, script);
  if (onFinish !== undefined) {
    const button = new Container();
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.position.set(260, 348);
    button.addChild(new Graphics().rect(0, 0, 120, 28).fill(UI_PALETTE.panelLight).stroke({ color: UI_PALETTE.parchmentDark, width: 1 }));
    const label = createPixelText('조서 닫기', { fontSize: 9, fill: UI_PALETTE.paper });
    label.anchor.set(0.5);
    label.position.set(60, 14);
    button.addChild(label);
    button.on('pointertap', onFinish);
    view.addChild(button);
  }
  return view;
}
