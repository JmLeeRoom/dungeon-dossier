import {
  Container,
  Graphics,
  Rectangle,
  type FederatedPointerEvent,
} from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';

export const INTERROGATION_INTRO_STAGE = {
  width: 640,
  height: 400,
} as const;

export const DEFAULT_INTERROGATION_INTRO_TITLE = '[사건 브리핑]';

export const DEFAULT_INTERROGATION_INTRO_BODY =
  "켄타우로스 인사팀장이 야근용으로 아끼던 전설의 '황금 엘릭서 믹스커피'가 사라졌다. 사건 현장인 탕비실 바닥에서 수상한 점액질 자국이 발견됨에 따라, 탕비실 청소를 담당하는 하급 슬라임 '물컹이'가 유력한 용의자로 심문실에 불려 오게 된다. 플레이어는 물컹이를 시작으로 마왕청 내 화이트칼라 마물들을 탐문하며 소소한 사내 범죄의 범인을 추적해야 한다.";

export const DEFAULT_INTERROGATION_INTRO_OBJECTIVE =
  '진술의 빈틈과 모순을 찾아 사건의 실마리를 확보하십시오.';

export interface InterrogationIntroModalOptions {
  readonly onStart: () => void;
  readonly title?: string;
  readonly body?: string;
  readonly objective?: string;
  /** Injectable for tests; the browser window is used by default. */
  readonly inputTarget?: EventTarget;
}

export interface InterrogationIntroModalController {
  readonly view: Container;
  readonly started: boolean;
  start(): void;
  /**
   * Releases input/listener ownership. The scene manager owns and destroys the
   * returned Pixi view, matching every other screen controller in this app.
   */
  destroy(): void;
}

const PANEL = { x: 66, y: 32, width: 508, height: 336 } as const;
const BUTTON = { x: 164, y: 273, width: 180, height: 36 } as const;

function drawStartButton(
  plate: Graphics,
  highlighted: boolean,
  pressed: boolean,
): void {
  plate
    .clear()
    .roundRect(0, pressed ? 2 : 0, BUTTON.width, BUTTON.height - (pressed ? 2 : 0), 3)
    .fill(highlighted ? UI_PALETTE.red : UI_PALETTE.panel)
    .stroke({
      color: highlighted ? UI_PALETTE.paper : UI_PALETTE.parchmentDark,
      width: highlighted ? 2 : 1,
    });
}

/**
 * Full-stage opening briefing. It is deliberately usable as a scene as well
 * as an overlay: bootstrap mounts it before the interrogation screen so the
 * obscured card battle cannot receive global keyboard input.
 */
export function createInterrogationIntroModal(
  options: InterrogationIntroModalOptions,
): InterrogationIntroModalController {
  const titleText = options.title ?? DEFAULT_INTERROGATION_INTRO_TITLE;
  const bodyText = options.body ?? DEFAULT_INTERROGATION_INTRO_BODY;
  const objectiveText = options.objective ?? DEFAULT_INTERROGATION_INTRO_OBJECTIVE;
  const inputTarget = options.inputTarget ?? (
    typeof window === 'undefined' ? undefined : window
  );

  const view = new Container();
  view.label = 'interrogation-intro-modal';
  view.eventMode = 'static';
  view.hitArea = new Rectangle(
    0,
    0,
    INTERROGATION_INTRO_STAGE.width,
    INTERROGATION_INTRO_STAGE.height,
  );

  const blocker = new Graphics()
    .rect(0, 0, INTERROGATION_INTRO_STAGE.width, INTERROGATION_INTRO_STAGE.height)
    .fill({ color: 0x050403, alpha: 0.88 });
  blocker.label = 'interrogation-intro-input-blocker';
  blocker.eventMode = 'static';
  blocker.on('pointerdown', (event: FederatedPointerEvent) => event.stopPropagation());
  blocker.on('pointerup', (event: FederatedPointerEvent) => event.stopPropagation());
  blocker.on('pointertap', (event: FederatedPointerEvent) => event.stopPropagation());
  view.addChild(blocker);

  const panel = new Container();
  panel.label = 'interrogation-intro-briefing-panel';
  panel.position.set(PANEL.x, PANEL.y);
  panel.addChild(
    new Graphics()
      .roundRect(5, 6, PANEL.width, PANEL.height, 5)
      .fill({ color: UI_PALETTE.shadow, alpha: 0.8 }),
    new Graphics()
      .roundRect(0, 0, PANEL.width, PANEL.height, 5)
      .fill(UI_PALETTE.parchment)
      .stroke({ color: UI_PALETTE.deepInk, width: 3 })
      .roundRect(7, 7, PANEL.width - 14, PANEL.height - 14, 2)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 1 }),
  );

  const caseTab = new Graphics()
    .roundRect(18, -5, 86, 18, 2)
    .fill(UI_PALETTE.red)
    .stroke({ color: UI_PALETTE.deepInk, width: 2 });
  const caseTabText = createPixelText('CASE FILE 01', {
    fontSize: 8,
    fill: UI_PALETTE.paper,
    letterSpacing: 1,
  });
  caseTabText.anchor.set(0.5);
  caseTabText.position.set(61, 4);

  const title = createPixelText(titleText, {
    fontSize: 18,
    fill: UI_PALETTE.ink,
    letterSpacing: 1,
  });
  title.anchor.set(0.5, 0);
  title.position.set(PANEL.width / 2, 22);

  const headingRule = new Graphics()
    .moveTo(25, 57)
    .lineTo(PANEL.width - 25, 57)
    .stroke({ color: UI_PALETTE.red, width: 2 })
    .moveTo(25, 61)
    .lineTo(PANEL.width - 25, 61)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });

  const body = createPixelText(bodyText, {
    fontSize: 10,
    fill: UI_PALETTE.ink,
    wordWrap: true,
    wordWrapWidth: PANEL.width - 54,
    lineHeight: 16,
  });
  body.label = 'interrogation-intro-body';
  body.position.set(27, 76);

  const objectivePlate = new Graphics()
    .roundRect(24, 202, PANEL.width - 48, 53, 2)
    .fill({ color: UI_PALETTE.parchmentDark, alpha: 0.36 })
    .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
  const objectiveLabel = createPixelText('수사 목표', {
    fontSize: 9,
    fill: UI_PALETTE.red,
  });
  objectiveLabel.position.set(37, 212);
  const objective = createPixelText(objectiveText, {
    fontSize: 9,
    fill: UI_PALETTE.ink,
    wordWrap: true,
    wordWrapWidth: PANEL.width - 138,
    lineHeight: 13,
  });
  objective.position.set(105, 212);

  const startButton = new Container();
  startButton.label = 'interrogation-intro-start-button';
  startButton.position.set(BUTTON.x, BUTTON.y);
  startButton.eventMode = 'static';
  startButton.cursor = 'pointer';
  startButton.hitArea = new Rectangle(0, 0, BUTTON.width, BUTTON.height);
  const startPlate = new Graphics();
  drawStartButton(startPlate, false, false);
  const startLabel = createPixelText('심문 시작', {
    fontSize: 11,
    fill: UI_PALETTE.paper,
    letterSpacing: 1,
  });
  startLabel.anchor.set(0.5);
  startLabel.position.set(BUTTON.width / 2, BUTTON.height / 2);
  startButton.addChild(startPlate, startLabel);

  const shortcutHint = createPixelText('ENTER / SPACE', {
    fontSize: 7,
    fill: UI_PALETTE.parchmentDark,
    letterSpacing: 1,
  });
  shortcutHint.anchor.set(0.5);
  shortcutHint.position.set(PANEL.width / 2, 319);

  panel.addChild(
    caseTab,
    caseTabText,
    title,
    headingRule,
    body,
    objectivePlate,
    objectiveLabel,
    objective,
    startButton,
    shortcutHint,
  );
  view.addChild(panel);

  let started = false;
  let destroyed = false;
  const start = (): void => {
    if (destroyed || started) return;
    started = true;
    options.onStart();
  };

  startButton.on('pointerover', () => {
    if (!destroyed && !started) drawStartButton(startPlate, true, false);
  });
  startButton.on('pointerout', () => {
    if (!destroyed && !started) drawStartButton(startPlate, false, false);
  });
  startButton.on('pointerdown', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    if (!destroyed && !started) drawStartButton(startPlate, true, true);
  });
  startButton.on('pointerup', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    if (!destroyed && !started) drawStartButton(startPlate, true, false);
  });
  startButton.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    start();
  });

  const keyListener: EventListener = (rawEvent) => {
    if (destroyed || started || !('code' in rawEvent)) return;
    const event = rawEvent as Event & { readonly code?: unknown; readonly repeat?: boolean };
    if (event.repeat === true || typeof event.code !== 'string') return;
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter' && event.code !== 'Space') return;
    event.preventDefault();
    event.stopPropagation();
    start();
  };
  inputTarget?.addEventListener('keydown', keyListener);

  return {
    view,
    get started(): boolean {
      return started;
    },
    start,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      inputTarget?.removeEventListener('keydown', keyListener);
      startButton.removeAllListeners();
      blocker.removeAllListeners();
      view.eventMode = 'none';
    },
  };
}
