import { Container, Graphics, Sprite } from 'pixi.js';

import { ASSET_DIMENSIONS } from '../../core/assetDimensions';
import { containImage } from '../../core/imageFit';
import { createPixelText } from '../../core/pixelText';
import type { ManagedUiLayer } from '../../core/sceneManager';
import type { AssetResolveContext } from '../../core/uiAssetPort';
import { UI_PALETTE } from '../../widgets/theme';
import type {
  EndingDirectionKey,
  JudgmentDirectionKey,
} from './directionTable';

export interface DirectionAssetLookup {
  resolveUrl(key: string): string | undefined;
  /** Exact lookup with no fallback; missing decorative art must stay invisible. */
  resolveOptionalUrl?(key: string): string | undefined;
  /** Required scene art fails with screen/content/slot context in production. */
  resolveRequiredUrl?(key: string, context: AssetResolveContext): string;
}

/** Structural boundary: callers can adapt AudioPlayer, Howler, or a test spy. */
export interface DirectionAudioPort {
  play(cue: string): void;
  mute(): void;
}

export interface DirectionRendererOptions {
  readonly assets?: DirectionAssetLookup;
  readonly audio?: DirectionAudioPort;
  readonly durationMs?: number;
}

export interface TimedDirectionOverlay extends ManagedUiLayer {
  readonly durationMs: number;
  readonly elapsedMs: number;
  readonly complete: boolean;
  update(deltaMs: number): void;
}

export type DirectionRenderer = (
  options?: DirectionRendererOptions,
) => TimedDirectionOverlay;

export const DIRECTION_AUDIO_CUES = Object.freeze({
  transferStamp: 'stamp',
  knock: 'knock_triple',
});

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 400;
const DEFAULT_DURATION_MS = 1_200;

type Animation = (progress: number, elapsedMs: number) => void;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function createOneShot(action: (() => void) | undefined): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    action?.();
  };
}

function timedOverlay(
  view: Container,
  options: DirectionRendererOptions,
  animate: Animation,
  enterEffect?: () => void,
): TimedDirectionOverlay {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError('Direction duration must be a positive finite number.');
  }
  let elapsedMs = 0;
  const enterOnce = createOneShot(enterEffect);
  animate(0, 0);
  return {
    view,
    durationMs,
    get elapsedMs(): number {
      return elapsedMs;
    },
    get complete(): boolean {
      return elapsedMs >= durationMs;
    },
    onEnter(): void {
      enterOnce();
      animate(clamp01(elapsedMs / durationMs), elapsedMs);
    },
    update(deltaMs): void {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError('Direction update requires a finite non-negative delta.');
      }
      elapsedMs = Math.min(durationMs, elapsedMs + deltaMs);
      animate(clamp01(elapsedMs / durationMs), elapsedMs);
    },
  };
}

function addBackdrop(view: Container, color: number, alpha = 0.82): Graphics {
  const backdrop = new Graphics()
    .rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
    .fill({ color, alpha });
  view.addChild(backdrop);
  return backdrop;
}

function addCenteredLabel(
  view: Container,
  text: string,
  y: number,
  fill: number,
  fontSize = 14,
): ReturnType<typeof createPixelText> {
  const label = createPixelText(text, { fontSize, fill, align: 'center' });
  label.anchor.set(0.5);
  label.position.set(STAGE_WIDTH / 2, y);
  view.addChild(label);
  return label;
}

function addOptionalSprite(
  view: Container,
  assets: DirectionAssetLookup | undefined,
  key: string,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
): void {
  const url = assets?.resolveOptionalUrl !== undefined
    ? assets.resolveOptionalUrl(key)
    : assets?.resolveUrl(key);
  if (url === undefined) return;
  const sprite = Sprite.from(url);
  sprite.position.set(bounds.x, bounds.y);
  sprite.width = bounds.width;
  sprite.height = bounds.height;
  view.addChild(sprite);
}

function createPolaroidDirection(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const view = new Container();
  addBackdrop(view, UI_PALETTE.deepInk, 0.72);
  const suspect = new Container();
  suspect.position.set(126, 248);
  suspect.addChild(
    new Graphics()
      .circle(0, -58, 31)
      .fill(UI_PALETTE.muted)
      .moveTo(-44, 76)
      .lineTo(-31, -24)
      .lineTo(31, -24)
      .lineTo(44, 76)
      .closePath()
      .fill(UI_PALETTE.panel),
  );
  view.addChild(suspect);
  const photo = new Container();
  photo.position.set(320, 210);
  photo.rotation = -0.045;
  photo.addChild(
    new Graphics()
      .roundRect(-126, -142, 252, 284, 4)
      .fill(UI_PALETTE.paper)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 3 })
      .rect(-108, -122, 216, 196)
      .fill(UI_PALETTE.panel),
  );
  addOptionalSprite(photo, options.assets, 'direction/ending/polaroid', {
    x: -108,
    y: -122,
    width: 216,
    height: 196,
  });
  const caption = createPixelText('진술 확보', {
    fontSize: 13,
    fill: UI_PALETTE.ink,
  });
  caption.anchor.set(0.5);
  caption.position.set(0, 105);
  photo.addChild(caption);
  view.addChild(photo);
  return timedOverlay(view, options, (progress) => {
    const eased = easeOutCubic(progress);
    suspect.position.x = 126 - eased * 220;
    suspect.alpha = 1 - eased;
    suspect.rotation = -eased * 0.08;
    photo.alpha = clamp01(progress * 3);
    photo.position.y = 255 - eased * 45;
    photo.scale.set(0.72 + eased * 0.28);
  });
}

function createTransferStampDirection(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const view = new Container();
  addBackdrop(view, UI_PALETTE.ink, 0.78);
  const paper = new Graphics()
    .roundRect(150, 74, 340, 252, 4)
    .fill(UI_PALETTE.paper)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 3 });
  for (let y = 112; y <= 286; y += 29) {
    paper.moveTo(178, y).lineTo(462, y).stroke({ color: UI_PALETTE.muted, width: 1 });
  }
  view.addChild(paper);
  addOptionalSprite(view, options.assets, 'direction/ending/transfer-stamp', {
    x: 150,
    y: 74,
    width: 340,
    height: 252,
  });
  const stamp = new Container();
  stamp.position.set(352, 212);
  stamp.rotation = -0.12;
  stamp.addChild(
    new Graphics()
      .roundRect(-76, -38, 152, 76, 8)
      .stroke({ color: UI_PALETTE.red, width: 6 }),
  );
  const stampText = createPixelText('송치', {
    fontSize: 25,
    fill: UI_PALETTE.red,
    letterSpacing: 7,
  });
  stampText.anchor.set(0.5);
  stamp.addChild(stampText);
  view.addChild(stamp);
  return timedOverlay(
    view,
    options,
    (progress, elapsedMs) => {
      const impact = easeOutCubic(clamp01(progress * 2.4));
      const impactFrame = elapsedMs >= 70 && elapsedMs < 118;
      view.position.x = impactFrame ? (Math.floor(elapsedMs / 16) % 2 === 0 ? -5 : 5) : 0;
      stamp.alpha = clamp01(progress * 5);
      stamp.scale.set(1.9 - impact * 0.9);
    },
    () => options.audio?.play(DIRECTION_AUDIO_CUES.transferStamp),
  );
}

function createBgmMuteDirection(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const view = new Container();
  const veil = addBackdrop(view, UI_PALETTE.shadow, 0);
  const victoryFrame = new Container();
  victoryFrame.position.set(320, 205);
  victoryFrame.rotation = -0.035;
  victoryFrame.addChild(
    new Graphics()
      .roundRect(-126, -142, 252, 284, 4)
      .fill(UI_PALETTE.paper)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 3 })
      .rect(-108, -122, 216, 196)
      .fill(UI_PALETTE.panel),
  );
  addOptionalSprite(victoryFrame, options.assets, 'direction/ending/polaroid', {
    x: -108,
    y: -122,
    width: 216,
    height: 196,
  });
  const victoryLabel = createPixelText('진술 확보', {
    fontSize: 13,
    fill: UI_PALETTE.muted,
  });
  victoryLabel.anchor.set(0.5);
  victoryLabel.position.set(0, 105);
  victoryFrame.addChild(victoryLabel);
  view.addChild(victoryFrame);
  const waveform = new Graphics();
  for (let index = 0; index < 11; index += 1) {
    const height = 18 + Math.abs(5 - index) * 6;
    waveform
      .rect(220 + index * 20, 200 - height / 2, 8, height)
      .fill(UI_PALETTE.muted);
  }
  waveform
    .moveTo(208, 148)
    .lineTo(432, 252)
    .stroke({ color: UI_PALETTE.red, width: 8 });
  view.addChild(waveform);
  const label = addCenteredLabel(view, '침묵', 290, UI_PALETTE.muted, 12);
  return timedOverlay(
    view,
    options,
    (progress) => {
      veil.alpha = 0.15 + progress * 0.8;
      victoryFrame.alpha = 1 - progress * 0.72;
      victoryFrame.scale.set(1 - progress * 0.08);
      waveform.alpha = 1 - progress * 0.7;
      label.alpha = clamp01(progress * 2);
    },
    () => options.audio?.mute(),
  );
}

function createCardAndKnockDirection(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const view = new Container();
  addBackdrop(view, UI_PALETTE.deepInk, 0.86);
  const door = new Graphics()
    .rect(330, 42, 220, 316)
    .fill(UI_PALETTE.panel)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 4 })
    .circle(510, 204, 7)
    .fill(UI_PALETTE.amber);
  view.addChild(door);
  const card = new Container();
  card.addChild(
    new Graphics()
      .roundRect(0, 0, 218, 116, 3)
      .fill(UI_PALETTE.paper)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 2 }),
  );
  addOptionalSprite(card, options.assets, 'direction/ending/counsel-card', {
    x: 0,
    y: 0,
    width: 218,
    height: 116,
  });
  const title = createPixelText('변호인', { fontSize: 16, fill: UI_PALETTE.ink });
  title.position.set(18, 23);
  const sub = createPixelText('면담 요청', { fontSize: 10, fill: UI_PALETTE.red });
  sub.position.set(18, 72);
  card.addChild(title, sub);
  view.addChild(card);
  return timedOverlay(
    view,
    options,
    (progress) => {
      const eased = easeOutCubic(progress);
      card.position.set(56 + eased * 42, 160);
      card.rotation = -0.09 + eased * 0.035;
      card.alpha = clamp01(progress * 4);
      door.alpha = 0.65 + Math.sin(progress * Math.PI * 4) * 0.08;
    },
    () => options.audio?.play(DIRECTION_AUDIO_CUES.knock),
  );
}

function createOverworkDirection(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const view = new Container();
  addBackdrop(view, UI_PALETTE.deepInk, 0.88);
  const ceiling = new Graphics()
    .roundRect(92, 48, 456, 254, 6)
    .fill(UI_PALETTE.panel)
    .stroke({ color: UI_PALETTE.muted, width: 3 })
    .moveTo(92, 48)
    .lineTo(252, 176)
    .moveTo(548, 48)
    .lineTo(388, 176)
    .moveTo(92, 302)
    .lineTo(252, 176)
    .moveTo(548, 302)
    .lineTo(388, 176)
    .stroke({ color: UI_PALETTE.shadow, width: 2 });
  const light = new Graphics()
    .roundRect(244, 139, 152, 68, 5)
    .fill(UI_PALETTE.paper)
    .stroke({ color: UI_PALETTE.parchment, width: 5 });
  view.addChild(ceiling, light);
  addOptionalSprite(view, options.assets, 'direction/ending/infirmary-ceiling', {
    x: 92,
    y: 48,
    width: 456,
    height: 254,
  });
  const systemPanel = new Graphics()
    .roundRect(104, 320, 432, 48, 3)
    .fill(UI_PALETTE.shadow)
    .stroke({ color: UI_PALETTE.red, width: 2 });
  view.addChild(systemPanel);
  const label = addCenteredLabel(
    view,
    'SYSTEM // 과로로 의무실에 이송되었습니다',
    344,
    UI_PALETTE.red,
    11,
  );
  return timedOverlay(view, options, (progress, elapsedMs) => {
    const drift = (1 - easeOutCubic(progress)) * Math.sin(elapsedMs / 28) * 4;
    ceiling.position.x = drift;
    light.position.x = drift;
    light.alpha = 0.72 + Math.sin(elapsedMs / 58) * 0.12;
    systemPanel.alpha = clamp01((progress - 0.28) * 4);
    label.alpha = clamp01((progress - 0.32) * 4);
  });
}

function judgmentBase(color: number): Readonly<{
  view: Container;
  plate: Graphics;
  crack: Graphics;
  flash: Graphics;
}> {
  const view = new Container();
  addBackdrop(view, UI_PALETTE.shadow, 0.38);
  const plate = new Graphics()
    .roundRect(118, 112, 404, 176, 6)
    .fill({ color: UI_PALETTE.panel, alpha: 0.94 })
    .stroke({ color, width: 4 });
  const crack = new Graphics()
    .moveTo(318, 116)
    .lineTo(300, 158)
    .lineTo(328, 181)
    .lineTo(304, 218)
    .lineTo(326, 284)
    .stroke({ color: UI_PALETTE.paper, width: 3 });
  const flash = new Graphics()
    .rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
    .fill(0xffffff);
  view.addChild(plate, crack, flash);
  return { view, plate, crack, flash };
}

function animateJudgmentImpact(
  crack: Graphics,
  flash: Graphics,
  progress: number,
): void {
  crack.alpha = clamp01(progress * 8);
  flash.alpha = progress < 0.08 ? 1 - progress / 0.08 : 0;
}

function createDirectJudgment(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const { view, plate, crack, flash } = judgmentBase(UI_PALETTE.red);
  const label = addCenteredLabel(view, '직접 모순', 200, UI_PALETTE.red, 21);
  const slash = new Graphics()
    .moveTo(192, 258)
    .lineTo(448, 142)
    .stroke({ color: UI_PALETTE.red, width: 7 });
  view.addChild(slash);
  return timedOverlay(view, options, (progress) => {
    const impact = easeOutCubic(clamp01(progress * 2));
    plate.scale.set(0.96 + impact * 0.04);
    plate.position.set((1 - impact) * 12, 0);
    slash.alpha = impact;
    label.alpha = clamp01(progress * 4);
    animateJudgmentImpact(crack, flash, progress);
  });
}

function createSuspicionJudgment(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const { view, crack, flash } = judgmentBase(UI_PALETTE.amber);
  const rings = new Graphics();
  for (let radius = 24; radius <= 72; radius += 24) {
    rings.circle(320, 195, radius).stroke({ color: UI_PALETTE.amber, width: 2 });
  }
  view.addChild(rings);
  const label = addCenteredLabel(view, '의심', 200, UI_PALETTE.amber, 20);
  return timedOverlay(view, options, (progress) => {
    rings.scale.set(0.65 + progress * 0.5);
    rings.alpha = 1 - progress * 0.75;
    label.alpha = clamp01(progress * 4);
    animateJudgmentImpact(crack, flash, progress);
  });
}

function createInsufficientJudgment(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const { view, crack, flash } = judgmentBase(UI_PALETTE.muted);
  const gap = new Graphics()
    .rect(202, 150, 92, 92)
    .fill(UI_PALETTE.paper)
    .rect(346, 150, 92, 92)
    .fill(UI_PALETTE.paper)
    .moveTo(302, 196)
    .lineTo(338, 196)
    .stroke({ color: UI_PALETTE.red, width: 3 });
  view.addChild(gap);
  const label = addCenteredLabel(view, '근거 부족', 264, UI_PALETTE.muted, 13);
  return timedOverlay(view, options, (progress) => {
    gap.alpha = clamp01(progress * 3);
    label.alpha = clamp01(progress * 3);
    gap.position.x = Math.sin(progress * Math.PI * 3) * 2;
    animateJudgmentImpact(crack, flash, progress);
  });
}

function createTruthAttackJudgment(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const { view, crack, flash } = judgmentBase(UI_PALETTE.blue);
  const rebound = new Graphics()
    .moveTo(198, 226)
    .lineTo(316, 146)
    .lineTo(442, 224)
    .stroke({ color: UI_PALETTE.cyan, width: 7 })
    .moveTo(316, 146)
    .lineTo(284, 160)
    .moveTo(316, 146)
    .lineTo(312, 180)
    .stroke({ color: UI_PALETTE.cyan, width: 5 });
  view.addChild(rebound);
  const label = addCenteredLabel(view, '진실 공격', 258, UI_PALETTE.cyan, 14);
  return timedOverlay(view, options, (progress) => {
    const eased = easeOutCubic(progress);
    rebound.alpha = clamp01(progress * 4);
    rebound.position.y = 18 - eased * 18;
    label.alpha = clamp01(progress * 3);
    animateJudgmentImpact(crack, flash, progress);
  });
}

function createIrrelevantJudgment(
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const { view, crack, flash } = judgmentBase(UI_PALETTE.muted);
  const document = new Graphics()
    .rect(245, 142, 150, 116)
    .fill(UI_PALETTE.paper)
    .stroke({ color: UI_PALETTE.muted, width: 2 });
  for (let y = 168; y <= 224; y += 18) {
    document.moveTo(265, y).lineTo(375, y).stroke({ color: UI_PALETTE.muted, width: 2 });
  }
  document
    .moveTo(234, 132)
    .lineTo(406, 270)
    .stroke({ color: UI_PALETTE.red, width: 6 });
  view.addChild(document);
  const label = addCenteredLabel(view, '무관한 증거', 274, UI_PALETTE.muted, 12);
  return timedOverlay(view, options, (progress) => {
    document.alpha = clamp01(progress * 4);
    document.rotation = (1 - easeOutCubic(progress)) * 0.08;
    label.alpha = clamp01(progress * 3);
    animateJudgmentImpact(crack, flash, progress);
  });
}

export const ENDING_DIRECTION_RENDERERS = {
  ENDING_POLAROID: createPolaroidDirection,
  ENDING_TRANSFER_STAMP: createTransferStampDirection,
  ENDING_BGM_MUTE: createBgmMuteDirection,
  ENDING_CARD_AND_KNOCK: createCardAndKnockDirection,
  ENDING_OVERWORK: createOverworkDirection,
} satisfies Record<EndingDirectionKey, DirectionRenderer>;

export const JUDGMENT_DIRECTION_RENDERERS = {
  JUDGMENT_DIRECT: createDirectJudgment,
  JUDGMENT_SUSPICION: createSuspicionJudgment,
  JUDGMENT_INSUFFICIENT: createInsufficientJudgment,
  JUDGMENT_TRUTH_ATTACK: createTruthAttackJudgment,
  JUDGMENT_IRRELEVANT: createIrrelevantJudgment,
} satisfies Record<JudgmentDirectionKey, DirectionRenderer>;

export const ENDING_DIRECTION_FACTORIES = ENDING_DIRECTION_RENDERERS;
export const JUDGMENT_DIRECTION_FACTORIES = JUDGMENT_DIRECTION_RENDERERS;

/**
 * Whether each of the five treatments closes the investigation or loses it.
 * `ENDING_BGM_MUTE` is a coerced confession: the case is closed, so it reads as
 * a clear even though the detective did not earn it cleanly.
 */
export const ENDING_DIRECTION_RESULTS = {
  ENDING_POLAROID: 'clear',
  ENDING_TRANSFER_STAMP: 'clear',
  ENDING_BGM_MUTE: 'clear',
  ENDING_CARD_AND_KNOCK: 'fail',
  ENDING_OVERWORK: 'fail',
} as const satisfies Record<EndingDirectionKey, 'clear' | 'fail'>;

export type EndingDirectionResult = (typeof ENDING_DIRECTION_RESULTS)[EndingDirectionKey];

export const RESULT_PLATE_ASSET_KEYS: Readonly<Record<EndingDirectionResult, string>> = {
  clear: 'ui/game/clear',
  fail: 'ui/game/fail',
};

/** Band the 1024x506 result plate is fitted into, in the 640x400 grid. */
export const RESULT_PLATE_BOUNDS = { x: 60, y: 18, width: 520, height: 110 } as const;

/**
 * The result plate is composited over the finished treatment rather than
 * replacing it: the five directions carry the narrative beat, and this states
 * the outcome. It is fitted, never stretched — the plate is 2.02:1 and the band
 * is 4.7:1, so filling the band would flatten the artwork.
 */
function addResultPlate(
  view: Container,
  assets: DirectionAssetLookup | undefined,
  result: EndingDirectionResult,
): void {
  const key = RESULT_PLATE_ASSET_KEYS[result];
  const url = assets?.resolveRequiredUrl?.(key, {
    screen: 'encounter-result',
    contentId: result,
    slotId: 'result-plate',
    bundle: 'result',
  }) ?? (
    assets?.resolveOptionalUrl !== undefined
      ? assets.resolveOptionalUrl(key)
      : assets?.resolveUrl(key)
  );
  if (url === undefined) return;
  const rect = containImage(ASSET_DIMENSIONS.result_1024x506, RESULT_PLATE_BOUNDS);
  const sprite = Sprite.from(url);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width;
  sprite.height = rect.height;
  sprite.eventMode = 'none';
  view.addChild(sprite);
}

export function createEndingDirection(
  key: EndingDirectionKey,
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  const overlay = ENDING_DIRECTION_RENDERERS[key](options);
  addResultPlate(overlay.view, options.assets, ENDING_DIRECTION_RESULTS[key]);
  return overlay;
}

export function createJudgmentDirection(
  key: JudgmentDirectionKey,
  options: DirectionRendererOptions = {},
): TimedDirectionOverlay {
  return JUDGMENT_DIRECTION_RENDERERS[key](options);
}

export const createEndingDirectionOverlay = createEndingDirection;
export const createJudgmentDirectionOverlay = createJudgmentDirection;
