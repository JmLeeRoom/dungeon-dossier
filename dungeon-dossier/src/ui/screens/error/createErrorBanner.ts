import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';

export const RUN_FLOW_ERROR_MESSAGE =
  '수사 진행 중 오류가 발생했습니다. 이전 상태로 복구합니다.';

export interface ErrorBannerModel {
  readonly title?: string;
  readonly message: string;
}

export interface ErrorBannerCallbacks {
  readonly onRetry: () => void;
  readonly onReturnToStrip: () => void;
}

export interface ErrorBannerActionModel {
  readonly id: 'RETRY' | 'RETURN_TO_STRIP';
  readonly label: string;
}

/** Pure action model kept separate so the recovery contract is regression-testable. */
export function errorBannerActions(): readonly ErrorBannerActionModel[] {
  return [
    { id: 'RETRY', label: '다시 시도' },
    { id: 'RETURN_TO_STRIP', label: '진행 기록으로 복귀' },
  ];
}

/** Modal overlay that surfaces a run-flow failure instead of a silent screen. */
export function createErrorBanner(
  model: ErrorBannerModel,
  callbacks: ErrorBannerCallbacks,
): Container {
  const view = new Container();
  view.eventMode = 'static';

  const dim = new Graphics().rect(0, 0, 640, 400).fill({ color: 0x000000, alpha: 0.62 });
  dim.eventMode = 'static';
  view.addChild(dim);

  const panel = new Container();
  panel.position.set(70, 105);
  panel.addChild(
    new Graphics()
      .roundRect(0, 0, 500, 190, 4)
      .fill(UI_PALETTE.panel)
      .stroke({ color: UI_PALETTE.red, width: 2 }),
  );

  const title = createPixelText(model.title ?? '진행 오류', {
    fontSize: 13,
    fill: UI_PALETTE.red,
  });
  title.position.set(20, 16);
  panel.addChild(title);

  const message = createPixelText(model.message, {
    fontSize: 9,
    fill: UI_PALETTE.paper,
    wordWrap: true,
    wordWrapWidth: 460,
    lineHeight: 13,
  });
  message.position.set(20, 44);
  panel.addChild(message);

  const callbackByAction = {
    RETRY: callbacks.onRetry,
    RETURN_TO_STRIP: callbacks.onReturnToStrip,
  } satisfies Record<ErrorBannerActionModel['id'], () => void>;
  for (const [index, action] of errorBannerActions().entries()) {
    const button = new Container();
    button.position.set(80 + index * 180, 140);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.addChild(
      new Graphics()
        .roundRect(0, 0, 160, 32, 3)
        .fill(index === 0 ? UI_PALETTE.red : UI_PALETTE.deepInk)
        .stroke({ color: UI_PALETTE.parchmentDark, width: 1 }),
    );
    const buttonLabel = createPixelText(action.label, {
      fontSize: 9,
      fill: UI_PALETTE.paper,
    });
    buttonLabel.anchor.set(0.5);
    buttonLabel.position.set(80, 16);
    button.addChild(buttonLabel);
    button.on('pointertap', callbackByAction[action.id]);
    panel.addChild(button);
  }

  view.addChild(panel);
  return view;
}
