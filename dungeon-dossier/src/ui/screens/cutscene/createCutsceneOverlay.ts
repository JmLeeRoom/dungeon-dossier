import { Container, Graphics, Sprite, type FederatedPointerEvent } from 'pixi.js';

import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import {
  resolveTypewriterIntervalMs,
  TypewriterStream,
} from '../../widgets/typewriter';
import type {
  DirectionAssetLookup,
  DirectionRendererOptions,
  TimedDirectionOverlay,
} from '../interrogation/directions';
import {
  CUTSCENE_LAYOUT,
  DIMMED_PORTRAIT_ALPHA,
  presentationTreatmentFrame,
  type CutsceneBeatPhase,
  type CutsceneBeatView,
  type CutscenePlaybackState,
  type CutscenePortraitView,
  type CutsceneSelection,
} from './model';

export interface CutsceneOverlayOptions extends DirectionRendererOptions {
  /** Skip is refused unless the authored cutscene allows it. */
  readonly skippable: boolean;
  /** Stages one manual branch; the app commits it into a fresh draft. */
  readonly onChoice?: (beatId: string, choiceId: string) => void;
  /** Atomic skip staging, called once after the whole default path validates. */
  readonly onSkipChoices?: (selections: readonly CutsceneSelection[]) => void;
  /** Returns the next beat index; null ends the cutscene. Absent = next in order. */
  readonly resolveNext?: (beatId: string, choiceId?: string) => number | null;
}

export interface CutsceneOverlay extends TimedDirectionOverlay {
  /** Beat index currently on screen. */
  readonly beatIndex: number;
  readonly playbackState: CutscenePlaybackState;
  /** Actionable sub-state inside the beat; changes are observable by autoplay. */
  readonly beatPhase: CutsceneBeatPhase;
  /** Monotonic per overlay; increments on beat/phase/choice-set changes. */
  readonly interactionRevision: number;
  /** TYPING->READY/WAITING_CHOICE on the first call, then on to the next beat. */
  advance(): void;
  choose(choiceId: string): void;
  /** Stages every default branch from here exactly once, then completes. */
  skip(): void;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function resolveAssetUrl(
  assets: DirectionAssetLookup | undefined,
  key: string,
): string | undefined {
  return assets?.resolveOptionalUrl?.(key) ?? assets?.resolveUrl(key);
}

/** Decorative art is optional, so an unresolved key falls back to drawn stand-in art. */
function addArt(
  parent: Container,
  assets: DirectionAssetLookup | undefined,
  key: string,
  bounds: Rect,
  placeholder: Graphics,
): void {
  parent.addChild(placeholder);
  const url = resolveAssetUrl(assets, key);
  if (url === undefined) return;
  const sprite = Sprite.from(url);
  sprite.position.set(bounds.x, bounds.y);
  sprite.width = bounds.width;
  sprite.height = bounds.height;
  parent.addChild(sprite);
}

function backgroundPlaceholder(): Graphics {
  const { width, height } = CUTSCENE_LAYOUT.stage;
  const art = new Graphics().rect(0, 0, width, height).fill(UI_PALETTE.deepInk);
  for (let y = 40; y < height; y += 48) {
    art.moveTo(0, y).lineTo(width, y).stroke({ color: UI_PALETTE.panel, width: 2 });
  }
  return art;
}

function portraitPlaceholder(bounds: Rect): Graphics {
  const centerX = bounds.x + bounds.width / 2;
  return new Graphics()
    .rect(bounds.x, bounds.y, bounds.width, bounds.height)
    .fill({ color: UI_PALETTE.panel, alpha: 0.86 })
    .stroke({ color: UI_PALETTE.parchmentDark, width: 2 })
    .circle(centerX, bounds.y + bounds.height * 0.34, bounds.width * 0.18)
    .fill(UI_PALETTE.muted)
    .moveTo(centerX - bounds.width * 0.3, bounds.y + bounds.height)
    .lineTo(centerX - bounds.width * 0.16, bounds.y + bounds.height * 0.56)
    .lineTo(centerX + bounds.width * 0.16, bounds.y + bounds.height * 0.56)
    .lineTo(centerX + bounds.width * 0.3, bounds.y + bounds.height)
    .closePath()
    .fill(UI_PALETTE.panelLight);
}

function portraitBounds(side: CutscenePortraitView['side']): Rect {
  return side === 'LEFT' ? CUTSCENE_LAYOUT.portraitLeft : CUTSCENE_LAYOUT.portraitRight;
}

function createButton(
  label: string,
  bounds: Rect,
  onTap: () => void,
): Container {
  const view = new Container();
  view.position.set(bounds.x, bounds.y);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.addChild(
    new Graphics()
      .roundRect(0, 0, bounds.width, bounds.height, 3)
      .fill(UI_PALETTE.panel)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 1 }),
  );
  const text = createPixelText(label, {
    fontSize: 9,
    fill: UI_PALETTE.paper,
    align: 'center',
    wordWrapWidth: bounds.width - 12,
  });
  text.anchor.set(0.5);
  text.position.set(bounds.width / 2, bounds.height / 2);
  view.addChild(text);
  view.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation();
    onTap();
  });
  return view;
}

function assertPlayable(
  beats: readonly CutsceneBeatView[],
  skippable: boolean,
): void {
  if (beats.length === 0) {
    throw new RangeError('A cutscene needs at least one beat.');
  }
  for (const beat of beats) {
    const choiceIds = new Set(beat.choices.map((choice) => choice.choiceId));
    if (choiceIds.size !== beat.choices.length) {
      throw new RangeError(`Cutscene beat ${beat.beatId} repeats a choice id.`);
    }
    if (!skippable || beat.choices.length === 0) continue;
    if (beat.defaultChoiceId === undefined || !choiceIds.has(beat.defaultChoiceId)) {
      throw new RangeError(
        `Skippable cutscene beat ${beat.beatId} needs a default choice it owns.`,
      );
    }
  }
}

export function createCutsceneOverlay(
  beats: readonly CutsceneBeatView[],
  options: CutsceneOverlayOptions,
): CutsceneOverlay {
  assertPlayable(beats, options.skippable);

  const indexByBeatId = new Map<string, number>();
  beats.forEach((beat, index) => {
    if (!indexByBeatId.has(beat.beatId)) indexByBeatId.set(beat.beatId, index);
  });
  const totalDurationMs = beats.reduce((sum, beat) => sum + beat.durationMs, 0);

  const view = new Container();
  const stage = new Container();
  stage.eventMode = 'static';
  const backgroundLayer = new Container();
  const portraitLayer = new Container();
  const dialogueLayer = new Container();
  const choiceLayer = new Container();
  const flash = new Graphics()
    .rect(0, 0, CUTSCENE_LAYOUT.stage.width, CUTSCENE_LAYOUT.stage.height)
    .fill(0xffffff);
  flash.alpha = 0;
  stage.addChild(backgroundLayer, portraitLayer, dialogueLayer, choiceLayer);
  view.addChild(stage, flash);

  dialogueLayer.addChild(
    new Graphics()
      .rect(
        CUTSCENE_LAYOUT.dialoguePanel.x,
        CUTSCENE_LAYOUT.dialoguePanel.y,
        CUTSCENE_LAYOUT.dialoguePanel.width,
        CUTSCENE_LAYOUT.dialoguePanel.height,
      )
      .fill({ color: UI_PALETTE.deepInk, alpha: 0.92 })
      .stroke({ color: UI_PALETTE.parchmentDark, width: 2 }),
  );
  const speakerPlate = new Graphics()
    .rect(
      CUTSCENE_LAYOUT.speakerPlate.x,
      CUTSCENE_LAYOUT.speakerPlate.y,
      CUTSCENE_LAYOUT.speakerPlate.width,
      CUTSCENE_LAYOUT.speakerPlate.height,
    )
    .fill(UI_PALETTE.panel)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
  const speakerText = createPixelText('', {
    fontSize: 10,
    fill: UI_PALETTE.parchment,
  });
  speakerText.position.set(
    CUTSCENE_LAYOUT.speakerPlate.x + 8,
    CUTSCENE_LAYOUT.speakerPlate.y + 5,
  );
  const bodyText = createPixelText('', {
    fontSize: 10,
    fill: UI_PALETTE.paper,
    lineHeight: 15,
    wordWrap: true,
    wordWrapWidth: CUTSCENE_LAYOUT.bodyText.width,
  });
  bodyText.position.set(CUTSCENE_LAYOUT.bodyText.x, CUTSCENE_LAYOUT.bodyText.y);
  dialogueLayer.addChild(speakerPlate, speakerText, bodyText);

  const typewriterIntervalMs = resolveTypewriterIntervalMs();
  let stream = new TypewriterStream(typewriterIntervalMs);

  let beatIndex = 0;
  let beatElapsedMs = 0;
  let treatmentElapsedMs = 0;
  let elapsedMs = 0;
  let interactionRevision = 0;
  let playbackState: CutscenePlaybackState = 'RUNNING';
  let beatPhase: CutsceneBeatPhase = 'TYPING';
  let backgroundKey: string | undefined;
  let entered = false;

  function beatAt(index: number): CutsceneBeatView {
    const beat = beats[index];
    if (beat === undefined) {
      throw new RangeError(`Cutscene beat index ${String(index)} does not exist.`);
    }
    return beat;
  }

  function currentBeat(): CutsceneBeatView {
    return beatAt(beatIndex);
  }

  function applyTreatment(): void {
    const frame = presentationTreatmentFrame(
      currentBeat().treatment,
      treatmentElapsedMs,
    );
    stage.alpha = frame.alpha;
    stage.position.x = frame.offsetX;
    flash.alpha = frame.flashAlpha;
  }

  function renderPortraits(beat: CutsceneBeatView): void {
    portraitLayer.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    for (const portrait of beat.portraits) {
      const bounds = portraitBounds(portrait.side);
      const frame = new Container();
      frame.alpha = portrait.dim ? DIMMED_PORTRAIT_ALPHA : 1;
      addArt(frame, options.assets, portrait.assetKey, bounds, portraitPlaceholder(bounds));
      portraitLayer.addChild(frame);
    }
  }

  function renderBackground(beat: CutsceneBeatView): void {
    const key = beat.backgroundAssetKey;
    if (key === undefined || key === backgroundKey) return;
    backgroundKey = key;
    backgroundLayer.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    addArt(
      backgroundLayer,
      options.assets,
      key,
      { x: 0, y: 0, ...CUTSCENE_LAYOUT.stage },
      backgroundPlaceholder(),
    );
  }

  function renderChoices(beat: CutsceneBeatView): void {
    choiceLayer.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    choiceLayer.visible = false;
    if (beat.choices.length === 0) return;
    const dim = new Graphics()
      .rect(0, 0, CUTSCENE_LAYOUT.stage.width, CUTSCENE_LAYOUT.stage.height)
      .fill({ color: UI_PALETTE.shadow, alpha: 0.55 });
    dim.eventMode = 'static';
    choiceLayer.addChild(dim);
    const { x, y, width, rowHeight, rowGap } = CUTSCENE_LAYOUT.choices;
    beat.choices.forEach((choice, row) => {
      choiceLayer.addChild(
        createButton(
          choice.label,
          { x, y: y + row * (rowHeight + rowGap), width, height: rowHeight },
          () => {
            choose(choice.choiceId);
          },
        ),
      );
    });
  }

  function renderBody(): void {
    bodyText.text = stream.snapshot().visibleText;
  }

  function enterBeat(index: number): void {
    const beat = beatAt(index);
    beatIndex = index;
    beatElapsedMs = 0;
    treatmentElapsedMs = 0;
    beatPhase = 'TYPING';
    playbackState = 'RUNNING';
    stream = new TypewriterStream(typewriterIntervalMs);
    stream.append(beat.text);
    stream.finish();
    speakerText.text = beat.speakerName ?? '';
    speakerPlate.visible = beat.speakerName !== undefined;
    speakerText.visible = speakerPlate.visible;
    renderBackground(beat);
    renderPortraits(beat);
    renderChoices(beat);
    renderBody();
    applyTreatment();
    if (entered) playBeatCue();
  }

  function playBeatCue(): void {
    const cue = currentBeat().audioCue;
    if (cue !== undefined) options.audio?.play(cue);
  }

  function fallthroughIndex(beatId: string): number | null {
    const index = indexByBeatId.get(beatId);
    if (index === undefined) {
      throw new RangeError(`Unknown cutscene beat: ${beatId}`);
    }
    return index + 1 < beats.length ? index + 1 : null;
  }

  function resolveNextIndex(beatId: string, choiceId?: string): number | null {
    const next =
      options.resolveNext === undefined
        ? fallthroughIndex(beatId)
        : options.resolveNext(beatId, choiceId);
    if (next === null) return null;
    if (!Number.isInteger(next) || next < 0 || next >= beats.length) {
      throw new RangeError(
        `Cutscene branch resolved to an unusable beat index: ${String(next)}.`,
      );
    }
    return next;
  }

  function completePlayback(): void {
    playbackState = 'COMPLETE';
    beatPhase = 'READY';
    choiceLayer.visible = false;
    interactionRevision += 1;
  }

  function goTo(nextIndex: number | null): void {
    if (nextIndex === null) {
      completePlayback();
      return;
    }
    enterBeat(nextIndex);
    interactionRevision += 1;
  }

  function settleTyping(): void {
    const beat = currentBeat();
    if (beat.choices.length > 0) {
      beatPhase = 'WAITING_CHOICE';
      playbackState = 'WAITING_INPUT';
      choiceLayer.visible = true;
    } else {
      beatPhase = 'READY';
    }
    interactionRevision += 1;
  }

  function fastForwardTyping(): void {
    stream.advance(typewriterIntervalMs * (Array.from(currentBeat().text).length + 1));
    renderBody();
    settleTyping();
  }

  function choose(choiceId: string): void {
    if (playbackState !== 'WAITING_INPUT') return;
    const beat = currentBeat();
    const choice = beat.choices.find((candidate) => candidate.choiceId === choiceId);
    if (choice === undefined) {
      throw new RangeError(`Cutscene beat ${beat.beatId} has no choice ${choiceId}.`);
    }
    // Resolution is computed and validated before any staging so a throw here
    // leaves both the app draft and the overlay untouched.
    const nextIndex = resolveNextIndex(beat.beatId, choice.choiceId);
    options.onChoice?.(beat.beatId, choice.choiceId);
    goTo(nextIndex);
  }

  function collectDefaultPath(): readonly CutsceneSelection[] {
    const selections: CutsceneSelection[] = [];
    const visited = new Set<string>();
    let index: number | null = beatIndex;
    while (index !== null) {
      const beat = beatAt(index);
      if (visited.has(beat.beatId)) {
        throw new RangeError(`Cutscene default path cycles through ${beat.beatId}.`);
      }
      visited.add(beat.beatId);
      let choiceId: string | undefined;
      if (beat.choices.length > 0) {
        const defaultChoiceId = beat.defaultChoiceId;
        if (
          defaultChoiceId === undefined ||
          !beat.choices.some((choice) => choice.choiceId === defaultChoiceId)
        ) {
          throw new RangeError(
            `Cutscene beat ${beat.beatId} has no default choice to skip through.`,
          );
        }
        choiceId = defaultChoiceId;
        selections.push({ beatId: beat.beatId, choiceId: defaultChoiceId });
      }
      index = resolveNextIndex(beat.beatId, choiceId);
    }
    return selections;
  }

  function advance(): void {
    if (playbackState === 'COMPLETE' || playbackState === 'CANCELLED') return;
    if (beatPhase === 'TYPING') {
      fastForwardTyping();
      return;
    }
    if (beatPhase !== 'READY') return;
    goTo(resolveNextIndex(currentBeat().beatId, undefined));
  }

  function skip(): void {
    if (!options.skippable) return;
    if (playbackState === 'COMPLETE' || playbackState === 'CANCELLED') return;
    const selections = collectDefaultPath();
    if (selections.length > 0) options.onSkipChoices?.(selections);
    completePlayback();
  }

  stage.on('pointertap', () => {
    advance();
  });
  enterBeat(0);
  if (options.skippable) {
    stage.addChild(
      createButton('건너뛰기', CUTSCENE_LAYOUT.skipButton, () => {
        skip();
      }),
    );
  }

  return {
    view,
    durationMs: Math.max(1, totalDurationMs),
    get elapsedMs(): number {
      return elapsedMs;
    },
    get complete(): boolean {
      return playbackState === 'COMPLETE';
    },
    get beatIndex(): number {
      return beatIndex;
    },
    get playbackState(): CutscenePlaybackState {
      return playbackState;
    },
    get beatPhase(): CutsceneBeatPhase {
      return beatPhase;
    },
    get interactionRevision(): number {
      return interactionRevision;
    },
    onEnter(): void {
      if (!entered) {
        entered = true;
        playBeatCue();
      }
      applyTreatment();
    },
    onDestroy(): void {
      if (playbackState !== 'COMPLETE') playbackState = 'CANCELLED';
    },
    update(deltaMs): void {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError('Cutscene update requires a finite non-negative delta.');
      }
      // Waiting on a branch must never tick a wall clock that could complete it.
      if (playbackState !== 'RUNNING') return;
      elapsedMs += deltaMs;
      beatElapsedMs += deltaMs;
      treatmentElapsedMs += deltaMs;
      applyTreatment();
      const snapshot = stream.advance(deltaMs);
      renderBody();
      if (beatPhase === 'TYPING' && snapshot.caughtUp) settleTyping();
      if (beatPhase === 'READY' && beatElapsedMs >= currentBeat().durationMs) {
        goTo(resolveNextIndex(currentBeat().beatId, undefined));
      }
    },
    advance,
    choose,
    skip,
  };
}
