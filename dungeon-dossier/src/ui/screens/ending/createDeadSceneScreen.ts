import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { createTypewriter, type TypewriterController } from '../../widgets';
import { UI_PALETTE } from '../../widgets/theme';
import type { DirectionAssetLookup } from '../interrogation/directions';
import {
  deadSceneTreatmentDurationMs,
  type DeadSceneScreenModel,
} from './deadSceneModel';

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 400;

export interface DeadSceneScreenController {
  readonly view: Container;
  update(elapsedMs: number): void;
  /** Finishes the entry treatment and the cause typewriter immediately. */
  skip(): void;
  destroy(): void;
}

export interface DeadSceneScreenCallbacks {
  readonly onAction?: (actionId: string) => void;
}

function addActionButton(
  parent: Container,
  label: string,
  x: number,
  y: number,
  width: number,
  enabled: boolean,
  onPress: () => void,
): void {
  const view = new Container();
  view.position.set(x, y);
  view.eventMode = 'static';
  view.cursor = enabled ? 'pointer' : 'default';
  view.addChild(
    new Graphics()
      .roundRect(0, 0, width, 30, 3)
      .fill(enabled ? UI_PALETTE.panelLight : UI_PALETTE.panel)
      .stroke({ color: enabled ? UI_PALETTE.parchmentDark : UI_PALETTE.muted, width: 1 }),
  );
  const text = createPixelText(label, {
    fontSize: 9,
    fill: enabled ? UI_PALETTE.paper : UI_PALETTE.muted,
  });
  text.anchor.set(0.5);
  text.position.set(width / 2, 15);
  view.addChild(text);
  if (enabled) view.on('pointertap', onPress);
  parent.addChild(view);
}

/**
 * The defeat screen. It deliberately never auto-advances: a run only ends when
 * the player chooses retry or return, so a loss is always acknowledged.
 */
export function createDeadSceneScreen(
  model: DeadSceneScreenModel,
  services: { readonly assets?: DirectionAssetLookup } = {},
  callbacks: DeadSceneScreenCallbacks = {},
): DeadSceneScreenController {
  const view = new Container();
  const content = new Container();
  view.addChild(content);

  content.addChild(new Graphics().rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill(UI_PALETTE.deepInk));

  const illustrationUrl =
    services.assets?.resolveOptionalUrl?.(model.illustrationAssetKey) ??
    services.assets?.resolveUrl(model.illustrationAssetKey);
  if (illustrationUrl !== undefined) {
    const image = new Sprite(Texture.from(illustrationUrl));
    image.width = STAGE_WIDTH;
    image.height = 220;
    image.alpha = 0.55;
    content.addChild(image);
  }
  content.addChild(
    new Graphics().rect(0, 0, STAGE_WIDTH, 220).fill({ color: UI_PALETTE.deepInk, alpha: 0.45 }),
  );

  const title = createPixelText(model.title, { fontSize: 22, fill: UI_PALETTE.red });
  title.anchor.set(0.5, 0);
  title.position.set(320, 54);
  content.addChild(title);

  const cause: TypewriterController = createTypewriter({ width: 480, height: 46 });
  cause.view.position.set(80, 112);
  cause.append(model.cause);
  content.addChild(cause.view);

  model.stats.forEach((stat, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const line = createPixelText(`${stat.label}  ${stat.value}`, {
      fontSize: 9,
      fill: UI_PALETTE.parchmentDark,
    });
    line.position.set(80 + column * 250, 190 + row * 18);
    content.addChild(line);
  });

  const actionWidth = 150;
  const gap = 20;
  const total = model.actions.length * actionWidth + (model.actions.length - 1) * gap;
  model.actions.forEach((action, index) => {
    const x = (STAGE_WIDTH - total) / 2 + index * (actionWidth + gap);
    addActionButton(content, action.label, x, 322, actionWidth, action.enabled, () =>
      callbacks.onAction?.(action.actionId),
    );
    if (!action.enabled && action.disabledReason !== undefined) {
      const reason = createPixelText(action.disabledReason, {
        fontSize: 8,
        fill: UI_PALETTE.muted,
        wordWrap: true,
        wordWrapWidth: actionWidth,
        align: 'center',
      });
      reason.anchor.set(0.5, 0);
      reason.position.set(x + actionWidth / 2, 356);
      content.addChild(reason);
    }
  });

  const flash = new Graphics().rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill(0xffffff);
  flash.visible = model.treatment === 'FLASH';
  view.addChild(flash);

  const durationMs = deadSceneTreatmentDurationMs(model.treatment);
  let elapsedMs = 0;
  const applyTreatment = (): void => {
    const progress = durationMs <= 0 ? 1 : Math.min(1, elapsedMs / durationMs);
    if (model.treatment === 'FLASH') {
      flash.alpha = 0.85 * (1 - progress);
      flash.visible = progress < 1;
      content.alpha = 1;
      return;
    }
    content.alpha = progress;
  };
  content.alpha = model.treatment === 'FLASH' ? 1 : 0;
  applyTreatment();

  return {
    view,
    update(deltaMs): void {
      if (Number.isFinite(deltaMs) && deltaMs > 0) elapsedMs += deltaMs;
      applyTreatment();
      cause.update(deltaMs);
    },
    skip(): void {
      elapsedMs = durationMs;
      applyTreatment();
      cause.finish();
    },
    destroy(): void {
      view.destroy({ children: true });
    },
  };
}
