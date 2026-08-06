import { Container, Graphics } from 'pixi.js';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import { placementResultLabel, type EventSceneModel } from './model';

export interface EventScreenCallbacks {
  readonly onChoice?: (choiceId: string) => void;
  readonly onPlacementSubmit?: (placement: Readonly<Record<string, string>>) => void;
  readonly onInvestigate?: (spotId: string) => void;
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
): EventActionControl {
  const view = new Container();
  view.position.set(x, y);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.addChild(new Graphics().roundRect(0, 0, width, 34, 3).fill(UI_PALETTE.panel).stroke({
    color: UI_PALETTE.parchmentDark,
    width: 1,
  }));
  const text = createPixelText(label, { fontSize: 9, fill: UI_PALETTE.paper, wordWrap: true, wordWrapWidth: width - 12, align: 'center' });
  text.anchor.set(0.5);
  text.position.set(width / 2, 17);
  view.addChild(text);
  view.on('pointertap', callback);
  return {
    view,
    setLabel(nextLabel): void {
      text.text = nextLabel;
    },
  };
}

export function createEventScreen(model: EventSceneModel, callbacks: EventScreenCallbacks = {}): Container {
  const view = new Container();
  view.addChild(new Graphics().rect(0, 0, 640, 400).fill(UI_PALETTE.deepInk));
  view.addChild(new Graphics().rect(30, 24, 580, 352).fill(UI_PALETTE.panel).stroke({ color: UI_PALETTE.parchmentDark, width: 2 }));
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
      ).view);
      const costLabels = choice.costs.map((cost) => cost.label).join(' · ');
      const gainLabels = choice.gains.map((gain) => gain.label).join(' · ');
      const parts = [
        ...(costLabels === '' ? [] : [`비용 ${costLabels}`]),
        ...(gainLabels === '' ? [] : [`획득 ${gainLabels}`]),
      ];
      if (parts.length > 0) {
        const detail = createPixelText(parts.join('   |   '), {
          fontSize: 8,
          fill: UI_PALETTE.amber,
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
  } else {
    model.spots.forEach((spot, index) => {
      const disabled = spot.discovered || model.attemptsUsed >= model.attemptLimit;
      view.addChild(action(`${spot.label}${disabled ? '  [조사 완료]' : ''}`, 70, 150 + index * 50, 500, () => {
        if (!disabled) callbacks.onInvestigate?.(spot.spotId);
      }).view);
    });
    const attempts = createPixelText(`조사 횟수 ${model.attemptsUsed}/${model.attemptLimit}`, { fontSize: 9, fill: UI_PALETTE.amber });
    attempts.position.set(438, 330);
    view.addChild(attempts);
  }
  return view;
}
