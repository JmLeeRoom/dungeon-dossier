import { Container, Graphics, Sprite } from 'pixi.js';
import { ASSET_DIMENSIONS } from '../../core/assetDimensions';
import { containImage, coverImage } from '../../core/imageFit';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import { placementResultLabel, type EventSceneModel } from './model';

export interface EventAssetLookup {
  resolveUrl(key: string): string | undefined;
  resolveOptionalUrl?(key: string): string | undefined;
  resolveRequiredUrl?(
    key: string,
    context: {
      readonly screen: string;
      readonly contentId?: string;
      readonly slotId?: string;
      readonly bundle?: 'event';
    },
  ): string;
}

export interface EventScreenServices {
  readonly assets?: EventAssetLookup;
}

export const EVENT_STAGE_BOUNDS = { x: 0, y: 0, width: 640, height: 400 } as const;

export interface EventScreenCallbacks {
  readonly onChoice?: (choiceId: string) => void;
  readonly onPlacementSubmit?: (placement: Readonly<Record<string, string>>) => void;
  readonly onInvestigate?: (spotId: string) => void;
  /** Pattern D: highlights an option or a target card without committing. */
  readonly onSelectTuning?: (selection: {
    readonly optionId?: string;
    readonly cardId?: string;
  }) => void;
  /** Pattern D: commits the highlighted option onto the highlighted card. */
  readonly onApplyTuning?: (optionId: string, cardId: string) => void;
  /** Pattern E */
  readonly onCanvass?: (topicId: string) => void;
  /** Pattern F */
  readonly onCollect?: (targetId: string) => void;
  readonly onContinue?: () => void;
}

interface EventActionControl {
  readonly view: Container;
  setLabel(label: string): void;
}

function action(
  label: string,
  x: number,
  y: number,
  width: number,
  callback: () => void,
  enabled = true,
): EventActionControl {
  const view = new Container();
  view.position.set(x, y);
  view.eventMode = 'static';
  view.cursor = enabled ? 'pointer' : 'default';
  view.addChild(new Graphics().roundRect(0, 0, width, 34, 3).fill(UI_PALETTE.panel).stroke({
    color: enabled ? UI_PALETTE.parchmentDark : UI_PALETTE.muted,
    width: 1,
  }));
  const text = createPixelText(label, {
    fontSize: 9,
    fill: enabled ? UI_PALETTE.paper : UI_PALETTE.muted,
    wordWrap: true,
    wordWrapWidth: width - 12,
    align: 'center',
  });
  text.anchor.set(0.5);
  text.position.set(width / 2, 17);
  view.addChild(text);
  // A disabled action swallows the tap: the run layer would throw on an
  // unaffordable choice and the error would never reach the player.
  if (enabled) view.on('pointertap', callback);
  return {
    view,
    setLabel(nextLabel): void {
      text.text = nextLabel;
    },
  };
}

/** Shared attempt counter for the three limited-probe patterns (C, E, F). */
function attemptFooter(
  used: number,
  limit: number,
  costs: readonly { readonly label: string }[],
  noun: string,
): Container {
  const costLabel = costs.map((cost) => cost.label).join(' · ');
  const text = createPixelText(
    costLabel === ''
      ? `${noun} 횟수 ${String(used)}/${String(limit)}`
      : `${noun} 횟수 ${String(used)}/${String(limit)}   |   회당 ${costLabel}`,
    { fontSize: 9, fill: UI_PALETTE.amber },
  );
  text.anchor.set(1, 0);
  text.position.set(592, 344);
  return text;
}

function requiredEventUrl(
  assets: EventAssetLookup | undefined,
  key: string,
  model: EventSceneModel,
  slotId: string,
): string | undefined {
  if (assets === undefined) return undefined;
  return assets.resolveRequiredUrl?.(key, {
    screen: 'event',
    contentId: model.eventId,
    slotId,
    bundle: 'event',
  }) ?? assets.resolveUrl(key);
}

function addEventBackground(
  view: Container,
  model: EventSceneModel,
  assets: EventAssetLookup | undefined,
): void {
  if (model.backgroundAssetKey !== undefined) {
    const url = requiredEventUrl(assets, model.backgroundAssetKey, model, 'background');
    if (url !== undefined) {
      const rect = coverImage(ASSET_DIMENSIONS.event_bg_1280x800, EVENT_STAGE_BOUNDS);
      const sprite = Sprite.from(url);
      sprite.position.set(rect.x, rect.y);
      sprite.width = rect.width;
      sprite.height = rect.height;
      sprite.eventMode = 'none';
      view.addChild(sprite);
    }
  }
}

function addEventDecoration(
  view: Container,
  model: EventSceneModel,
  assets: EventAssetLookup | undefined,
): void {
  const decoration = model.decoration;
  if (decoration === undefined) return;
  const url = requiredEventUrl(assets, decoration.assetKey, model, 'decoration');
  if (url === undefined) return;
  const rect = containImage(ASSET_DIMENSIONS.event_overlay_181x156, decoration);
  const sprite = Sprite.from(url);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width;
  sprite.height = rect.height;
  sprite.alpha = 0.9;
  sprite.eventMode = 'none';
  view.addChild(sprite);
}

export function createEventScreen(
  model: EventSceneModel,
  callbacks: EventScreenCallbacks = {},
  services: EventScreenServices = {},
): Container {
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));
  addEventBackground(view, model, services.assets);
  // The old opaque panel hid a full-screen background completely. The dark
  // wash keeps copy readable while leaving the scene legible underneath.
  view.addChild(new Graphics().rect(30, 24, 580, 352).fill({ color: UI_PALETTE.panel, alpha: 0.82 }).stroke({ color: UI_PALETTE.parchmentDark, width: 2 }));
  // Small transparent props sit above the wash but below all copy and controls.
  addEventDecoration(view, model, services.assets);
  const title = createPixelText(model.title, { fontSize: 15, fill: UI_PALETTE.paper });
  title.position.set(48, 42);
  const pattern = createPixelText(`EVENT ${model.pattern}`, { fontSize: 8, fill: UI_PALETTE.cyan });
  pattern.position.set(530, 46);
  const description = createPixelText(model.description, { fontSize: 10, fill: UI_PALETTE.parchment, wordWrap: true, wordWrapWidth: 520, lineHeight: 14 });
  description.position.set(48, 78);
  view.addChild(title, pattern, description);

  if (model.pattern === 'A') {
    model.choices.forEach((choice, index) => {
      const y = 152 + index * 62;
      view.addChild(action(
        choice.label,
        70,
        y,
        500,
        () => callbacks.onChoice?.(choice.choiceId),
        choice.affordable,
      ).view);
      const costLabels = choice.costs.map((cost) => cost.label).join(' · ');
      const gainLabels = choice.gains.map((gain) => gain.label).join(' · ');
      const parts = choice.affordable
        ? [
            ...(costLabels === '' ? [] : [`비용 ${costLabels}`]),
            ...(gainLabels === '' ? [] : [`획득 ${gainLabels}`]),
          ]
        : [choice.blockedReason ?? '자원 부족'];
      if (parts.length > 0) {
        const detail = createPixelText(parts.join('   |   '), {
          fontSize: 8,
          fill: choice.affordable ? UI_PALETTE.amber : UI_PALETTE.red,
          wordWrap: true,
          wordWrapWidth: 500,
        });
        detail.position.set(76, y + 38);
        view.addChild(detail);
      }
    });
  } else if (model.pattern === 'B' && model.placementResult !== undefined) {
    const resultLabel = placementResultLabel(model.placementResult.result);
    const result = createPixelText(
      `배치 결과 · ${resultLabel}\n${String(model.placementResult.correct)} / ${String(model.placementResult.total)} 연결 일치`,
      {
        fontSize: 13,
        fill: model.placementResult.result === 'FAILED' ? UI_PALETTE.red : UI_PALETTE.amber,
        align: 'center',
        lineHeight: 22,
      },
    );
    result.anchor.set(0.5);
    result.position.set(320, 200);
    view.addChild(result);
    view.addChild(action('계속', 240, 300, 160, () => callbacks.onContinue?.()).view);
  } else if (model.pattern === 'B') {
    const placement: Record<string, string> = {};
    model.items.forEach((item, itemIndex) => {
      // Offset start so the initial layout never mirrors the answer mapping;
      // the player must actively arrange the links before submitting.
      const slot = model.slots[(itemIndex + 1) % model.slots.length];
      if (slot !== undefined) placement[item.itemId] = slot.slotId;
      const slotLabel = slot?.label ?? '미배치';
      const control = action(`${item.label}  →  ${slotLabel}`, 70, 150 + itemIndex * 46, 500, () => {
        const currentIndex = model.slots.findIndex((candidate) => candidate.slotId === placement[item.itemId]);
        const next = model.slots[(currentIndex + 1) % model.slots.length];
        if (next !== undefined) {
          placement[item.itemId] = next.slotId;
          control.setLabel(`${item.label}  →  ${next.label}`);
        }
      });
      view.addChild(control.view);
    });
    view.addChild(action(
      '배치 제출',
      240,
      330,
      160,
      () => callbacks.onPlacementSubmit?.({ ...placement }),
    ).view);
  } else if (model.pattern === 'C') {
    const exhausted = model.attemptsUsed >= model.attemptLimit;
    model.spots.forEach((spot, index) => {
      const y = 142 + index * 54;
      const disabled = spot.discovered || exhausted || !spot.affordable;
      const suffix = spot.discovered
        ? '  [조사 완료]'
        : exhausted
          ? '  [횟수 소진]'
          : spot.affordable
            ? ''
            : '  [자원 부족]';
      view.addChild(action(
        `${spot.label}${suffix}`,
        70,
        y,
        500,
        () => callbacks.onInvestigate?.(spot.spotId),
        !disabled,
      ).view);
      // Pattern C used to give no feedback at all: the player probed a spot and
      // could not tell what, if anything, it had turned up.
      if (spot.discovered && spot.findings.length > 0) {
        const findings = createPixelText(
          `발견 · ${spot.findings.map((finding) => finding.label).join(' · ')}`,
          { fontSize: 8, fill: UI_PALETTE.cyan, wordWrap: true, wordWrapWidth: 500 },
        );
        findings.position.set(76, y + 36);
        view.addChild(findings);
      }
    });
    const attemptCostLabel = model.attemptCosts.map((cost) => cost.label).join(' · ');
    const attempts = createPixelText(
      attemptCostLabel === ''
        ? `조사 횟수 ${model.attemptsUsed}/${model.attemptLimit}`
        : `조사 횟수 ${model.attemptsUsed}/${model.attemptLimit}   |   회당 ${attemptCostLabel}`,
      { fontSize: 9, fill: UI_PALETTE.amber },
    );
    attempts.anchor.set(1, 0);
    attempts.position.set(592, 344);
    view.addChild(attempts);
    if (exhausted) {
      view.addChild(action('조사 종료', 48, 336, 140, () => callbacks.onContinue?.()).view);
    }
  } else if (model.pattern === 'D') {
    if (model.fallbackNotice !== undefined) {
      const notice = createPixelText(model.fallbackNotice, {
        fontSize: 10,
        fill: UI_PALETTE.amber,
        wordWrap: true,
        wordWrapWidth: 460,
        align: 'center',
      });
      notice.anchor.set(0.5, 0);
      notice.position.set(320, 180);
      view.addChild(notice);
      view.addChild(action('계속', 240, 300, 160, () => callbacks.onContinue?.()).view);
      return view;
    }
    const selectedOption = model.options.find(
      (option) => option.optionId === model.selectedOptionId,
    );
    const eligible = new Set(selectedOption?.eligibleCardIds ?? []);
    const columnLabel = (text: string, x: number): void => {
      const label = createPixelText(text, { fontSize: 9, fill: UI_PALETTE.cyan });
      label.position.set(x, 118);
      view.addChild(label);
    };
    columnLabel('강화 방식', 52);
    columnLabel('대상 카드', 336);

    model.options.forEach((option, index) => {
      const y = 136 + index * 52;
      const chosen = option.optionId === model.selectedOptionId;
      view.addChild(action(
        `${chosen ? '▶ ' : ''}${option.label}`,
        52,
        y,
        260,
        () => callbacks.onSelectTuning?.({ optionId: option.optionId }),
        option.affordable,
      ).view);
      const detail = option.affordable
        ? [...option.tuning, ...option.costs].map((entry) => entry.label).join(' · ')
        : option.blockedReason ?? '자원 부족';
      const text = createPixelText(detail, {
        fontSize: 8,
        fill: option.affordable ? UI_PALETTE.amber : UI_PALETTE.red,
        wordWrap: true,
        wordWrapWidth: 260,
      });
      text.position.set(56, y + 36);
      view.addChild(text);
    });

    model.cards.forEach((card, index) => {
      const y = 136 + index * 32;
      if (y > 290) return;
      const chosen = card.cardId === model.selectedCardId;
      // Until an option is picked every card is offered; afterwards only the
      // ones that option is allowed to touch stay live.
      const selectable = selectedOption === undefined || eligible.has(card.cardId);
      const banked = card.existingTuning.map((entry) => entry.label).join(' ');
      view.addChild(action(
        `${chosen ? '▶ ' : ''}${card.label}${banked === '' ? '' : `  (${banked})`}`,
        336,
        y,
        252,
        () => callbacks.onSelectTuning?.({ cardId: card.cardId }),
        selectable,
      ).view);
    });

    const ready =
      model.selectedOptionId !== undefined && model.selectedCardId !== undefined;
    view.addChild(action(
      '강화 적용',
      240,
      330,
      160,
      () => {
        if (model.selectedOptionId === undefined || model.selectedCardId === undefined) return;
        callbacks.onApplyTuning?.(model.selectedOptionId, model.selectedCardId);
      },
      ready,
    ).view);
  } else if (model.pattern === 'E') {
    const exhausted = model.attemptsUsed >= model.attemptLimit;
    model.topics.forEach((topic, index) => {
      const y = 136 + index * 54;
      const disabled = topic.canvassed || exhausted || !topic.affordable;
      const suffix = topic.canvassed
        ? '  [탐문 완료]'
        : exhausted
          ? '  [횟수 소진]'
          : topic.affordable
            ? ''
            : '  [자원 부족]';
      view.addChild(action(
        `${topic.label}${suffix}`,
        70,
        y,
        500,
        () => callbacks.onCanvass?.(topic.topicId),
        !disabled,
      ).view);
      if (topic.reveal !== undefined) {
        const reveal = createPixelText(`“${topic.reveal}”`, {
          fontSize: 8,
          fill: UI_PALETTE.cyan,
          wordWrap: true,
          wordWrapWidth: 500,
        });
        reveal.position.set(76, y + 36);
        view.addChild(reveal);
      }
    });
    view.addChild(attemptFooter(model.attemptsUsed, model.attemptLimit, model.attemptCosts, '탐문'));
    view.addChild(action('탐문 종료', 48, 336, 140, () => callbacks.onContinue?.()).view);
  } else {
    const exhausted = model.attemptsUsed >= model.attemptLimit;
    model.targets.forEach((target, index) => {
      const y = 136 + index * 44;
      const disabled =
        target.collected || target.alreadyHeld || exhausted || !target.affordable;
      const suffix = target.collected
        ? '  [수집 완료]'
        : target.alreadyHeld
          ? '  [이미 확보]'
          : exhausted
            ? '  [횟수 소진]'
            : target.affordable
              ? ''
              : '  [자원 부족]';
      view.addChild(action(
        `[${target.grade}] ${target.label}${suffix}`,
        70,
        y,
        500,
        () => callbacks.onCollect?.(target.targetId),
        !disabled,
      ).view);
    });
    view.addChild(attemptFooter(model.attemptsUsed, model.attemptLimit, model.attemptCosts, '감식'));
    view.addChild(action('감식 종료', 48, 336, 140, () => callbacks.onContinue?.()).view);
  }
  return view;
}
