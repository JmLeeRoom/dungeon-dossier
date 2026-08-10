import { Container, Graphics, Sprite } from 'pixi.js';
import type { StatementTokenView, SuspectStatePart } from '../../../dto';
import { bindSecondaryKeyboardInput } from '../../core/input';
import {
  applyAssetPlacement,
  requireAssetPlacement,
} from '../../core/placementRegistry';
import { createPixelText } from '../../core/pixelText';
import { createSceneShake, type ShakeProfile } from '../../core/shake';
import { createDossierScreen } from '../dossier';
import {
  coercionWarningSlipCount,
  createCardDetailModal,
  createCardFan,
  createEvidenceTray,
  createGaugeController,
  createPartnerPortrait,
  createShield,
  createSuspectPortrait,
  createTagChip,
  createTypewriter,
  applyTagChipDeactivation,
  deriveFacetTagChipState,
  TAG_CHIP_SIZE,
  UI_PALETTE,
  type CardDetailModalController,
  type CardAttachments,
  type CardFanController,
  type CardLayerId,
  type EvidenceTrayController,
  type GaugeController,
  type TagChipController,
} from '../../widgets';
import {
  CARD_ATTACHMENT_ASSET_KEYS,
  CARD_BASE_ASSET_KEY,
  CARD_LOCK_OVERLAY_ASSET_KEY,
  CP_PIP_ASSET_KEYS,
  HP_ICON_ASSET_KEY,
} from '../../../app/uiAssetBindings';
import { createJudgmentBanner, type JudgmentBannerController } from './judgmentBanner';
import { createPulseRings, createPunishJuice, PUNISH_TIMELINE } from './punishJuice';
import {
  canSubmitInterrogationSelection,
  interrogationCardKey,
  interrogationCardAllowsFacet,
  selectedInterrogationCard,
  type InterrogationAssetLookup,
  type InterrogationCallbacks,
  type InterrogationCardView,
  type InterrogationScreenModel,
  type InterrogationSelection,
  type JudgmentFeedbackView,
} from './model';

type PublicFacet = StatementTokenView['facet'];

const FACETS: readonly PublicFacet[] = ['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'];

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 400;
const BACKGROUND_PLACEMENT = requireAssetPlacement('bg-room');
const DESK_PLACEMENT = requireAssetPlacement('fg-desk');
const SUSPECT_PLACEMENT = requireAssetPlacement('suspect-base');
const PARTNER_PLACEMENT = requireAssetPlacement('partner-base');
const COMPOSURE_ICON_PLACEMENT = requireAssetPlacement('icon-composure');
const COERCION_ICON_PLACEMENT = requireAssetPlacement('icon-coercion');
/**
 * Desk height in the 640x400 grid, rounded up so the plate always reaches the
 * stage floor. The authored 1280x321 plate is 160.5 logical units tall; rounding
 * down would leave a 1px gap, so it is drawn one HD pixel taller instead.
 */
export const DESK_LOGICAL_HEIGHT = DESK_PLACEMENT.height;
export const DESK_TOP = DESK_PLACEMENT.y;
/**
 * The authored tag plate is 830x330. At the 98px row width the desk allots, an
 * aspect-true chip is 39px tall, not the 26px the vector chip used.
 */
export const TAG_ROW_HEIGHT = TAG_CHIP_SIZE.height;
export const TAG_CHIP_WIDTH = TAG_CHIP_SIZE.width;
export const TAG_CHIP_PITCH = 103;
/** Clearance between the tag chips and the desk edge they sit above. */
const TAG_ROW_GAP = 8;
export const TAG_ROW_Y = DESK_TOP - TAG_ROW_HEIGHT - TAG_ROW_GAP;
/**
 * On-desk widget offsets, measured from the desk edge rather than the stage
 * floor. The values reproduce the placements the screen already used, so a
 * taller plate adds headroom above the widgets instead of shifting them.
 */
export const DESK_TYPEWRITER_INSET = 49;
export const DESK_TRAY_INSET = 53;
export const DESK_PARTNER_INSET = 57;
export const DESK_ACTION_INSET = 57;
export const DESK_SECURE_INSET = 83;
export const DESK_DOSSIER_INSET = 105;
const CARD_HAND_SPACING = 112;
/** Command-point coins, drawn at full capacity so a spent point reads as empty. */
const CP_PIP_SIZE = 11;
const CP_PIP_GAP = 2;
const CP_PIP_ORIGIN_X = 26;
/** The heart sits left of the reading so `HP 87/100` scans as one unit. */
const HP_ICON_SIZE = 11;
/**
 * Fallback illustrations for the three cards with no approved art yet. They are
 * chosen by intent because that is all the generated set ever distinguished;
 * every card that *does* have approved art is bound by card id in
 * `uiAssetBindings`, never by intent.
 */
const LEGACY_CARD_ILLUSTRATION_ASSET_KEYS: Readonly<Record<string, string>> = {
  QUERY: 'card/질문/일러',
  CLARIFY: 'card/질문/일러',
  CONFIRM: 'card/질문/일러',
  CONTRADICT: 'card/모순/일러',
  PRESSURE: 'card/압박/일러',
  RECOVER: 'card/질문/일러',
  FORENSIC: 'card/모순/일러',
  SPECIAL: 'card/압박/일러',
  COMMIT: 'card/모순/일러',
};

export interface InterrogationScreenServices {
  readonly assets?: InterrogationAssetLookup;
  readonly inputTarget?: EventTarget;
}

/**
 * How the two suspect-facing resources moved across a re-mount. The screen is
 * rebuilt on every submission, so only the app layer sees both sides.
 */
export interface InterrogationResourceChange {
  readonly composureDelta: number;
  readonly coercionDelta: number;
}

export interface SuspectStateTransition {
  readonly from: SuspectStatePart;
  readonly to: SuspectStatePart;
}

export interface InterrogationScreenController {
  readonly view: Container;
  readonly selection: InterrogationSelection;
  readonly suspectStatePart: SuspectStatePart;
  appendStatementChunk(chunk: string): void;
  finishStatement(): void;
  useFallbackStatement(text: string): void;
  /** Shows the assembled judgment line above the evidence tray. */
  showJudgmentFeedback(feedback: JudgmentFeedbackView): void;
  clearJudgmentFeedback(): void;
  /** Impact juice for a coercion spike. A non-positive delta is ignored. */
  playCoercionRise(coercionDelta: number): void;
  /**
   * Shakes the bar that just moved against the player: composure falling or
   * coercion rising. A heal, an unchanged value and the first mount are all
   * silent, so the shake always means "that cost you something".
   */
  playResourceImpact(change: InterrogationResourceChange): void;
  /** Shakes the portrait for a state change the suspect just entered. */
  playSuspectTransition(transition: SuspectStateTransition): void;
  update(elapsedMs: number): void;
  openDossier(): void;
  destroy(): void;
}

interface ActionButtonController {
  readonly view: Container;
  setEnabled(enabled: boolean): void;
  setLabel(label: string): void;
}

function resolveRequiredSceneAsset(
  assets: InterrogationAssetLookup | undefined,
  key: string,
  slotId: string,
): string | undefined {
  if (assets === undefined) return undefined;
  return assets.resolveRequiredUrl?.(key, {
    screen: 'interrogation',
    slotId,
    bundle: 'interrogation',
  }) ?? assets.resolveUrl(key);
}

function createActionButton(
  labelText: string,
  width: number,
  height: number,
  onPress: () => void,
): ActionButtonController {
  const view = new Container();
  const plate = new Graphics();
  const label = createPixelText(labelText, { fontSize: 8, fill: UI_PALETTE.paper });
  label.anchor.set(0.5);
  label.position.set(width / 2, height / 2);
  view.addChild(plate, label);
  let enabled = true;
  const redraw = (): void => {
    plate
      .clear()
      .rect(0, 0, width, height)
      .fill(enabled ? UI_PALETTE.panelLight : UI_PALETTE.panel)
      .stroke({ color: enabled ? UI_PALETTE.parchmentDark : UI_PALETTE.muted, width: 1 });
    label.alpha = enabled ? 1 : 0.55;
    view.cursor = enabled ? 'pointer' : 'default';
  };
  view.eventMode = 'static';
  view.on('pointertap', () => {
    if (enabled) onPress();
  });
  redraw();
  return {
    view,
    setEnabled(value): void {
      enabled = value;
      redraw();
    },
    setLabel(value): void {
      label.text = value;
    },
  };
}

function addBackground(
  view: Container,
  assets: InterrogationAssetLookup | undefined,
  assetKey: string | undefined,
): void {
  const backgroundUrl = resolveRequiredSceneAsset(
    assets,
    assetKey ?? BACKGROUND_PLACEMENT.assetKey,
    BACKGROUND_PLACEMENT.slotId,
  );
  if (backgroundUrl !== undefined) {
    const background = Sprite.from(backgroundUrl);
    applyAssetPlacement(background, BACKGROUND_PLACEMENT);
    view.addChild(background);
    return;
  }
  const roomTop = 26;
  const floorBandTop = DESK_TOP - 72;
  const background = new Graphics()
    .rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
    .fill(0x111b1c)
    .rect(0, roomTop, STAGE_WIDTH, DESK_TOP - roomTop)
    .fill(0x192626)
    .rect(0, floorBandTop, STAGE_WIDTH, DESK_TOP - floorBandTop)
    .fill(0x25302b)
    .moveTo(0, floorBandTop)
    .lineTo(STAGE_WIDTH, floorBandTop)
    .stroke({ color: UI_PALETTE.panelLight, width: 2 });
  for (let x = 0; x < STAGE_WIDTH; x += 40) {
    background.moveTo(x, 26).lineTo(x, DESK_TOP).stroke({ color: 0x203130, width: 1 });
  }
  view.addChild(background);
}

/**
 * The authored 1280x321 desk plate. It is the one asset that deliberately
 * releases its aspect lock: 321 halves to 160.5, so the plate is drawn one HD
 * pixel taller to sit flush against the stage floor.
 */
function addDeskForeground(view: Container, assets: InterrogationAssetLookup | undefined): void {
  const deskUrl = resolveRequiredSceneAsset(
    assets,
    DESK_PLACEMENT.assetKey,
    DESK_PLACEMENT.slotId,
  );
  if (deskUrl !== undefined) {
    const desk = Sprite.from(deskUrl);
    applyAssetPlacement(desk, DESK_PLACEMENT);
    view.addChild(desk);
    return;
  }
  view.addChild(
    new Graphics()
      .rect(0, DESK_TOP, STAGE_WIDTH, DESK_LOGICAL_HEIGHT)
      .fill({ color: UI_PALETTE.panel, alpha: 0.88 })
      .moveTo(0, DESK_TOP)
      .lineTo(STAGE_WIDTH, DESK_TOP)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 2 }),
  );
}

interface HudAnchors {
  /** Centre of the 16x16 coercion icon, in stage coordinates. */
  readonly coercionAnchor: Readonly<{ x: number; y: number }>;
  readonly coercionIcon?: Container;
  /** The two bars, so the screen can register a hit on the one that moved. */
  readonly composureGauge: GaugeController;
  readonly coercionGauge: GaugeController;
}

const LOSE_SCENE_SHAKE: ShakeProfile = {
  durationMs: 400,
  amplitude: 6,
  oscillations: 5,
};

function addHud(
  view: Container,
  model: InterrogationScreenModel,
  assets: InterrogationAssetLookup | undefined,
): HudAnchors {
  const hud = new Container();
  const plate = new Graphics().rect(0, 0, STAGE_WIDTH, 26).fill({ color: UI_PALETTE.deepInk, alpha: 0.94 });
  const suspectPlate = new Graphics()
    .rect(7, 4, 124, 18)
    .fill(UI_PALETTE.red)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
  const suspect = createPixelText(`용의자  ${model.suspectName}`, {
    fontSize: 9,
    fill: UI_PALETTE.paper,
  });
  suspect.position.set(12, 8);
  const composure = createGaugeController(model.dto.resources.composure, model.composureMax, {
    width: 164,
    height: 12,
    label: '평정심',
    sweetSpotUnlocked: model.sweetSpotUnlocked,
    ...(model.sweetSpotMin === undefined ? {} : { sweetSpotMin: model.sweetSpotMin }),
    ...(model.sweetSpotMax === undefined ? {} : { sweetSpotMax: model.sweetSpotMax }),
    fill: UI_PALETTE.cyan,
  });
  composure.view.position.set(159, 7);
  const coercion = createGaugeController(model.dto.resources.coercion, model.coercionMax, {
    width: 152,
    height: 12,
    label: '강압',
    fill: UI_PALETTE.red,
    cellCount: 10,
  });
  coercion.view.position.set(346, 7);
  hud.addChild(plate, suspectPlate, suspect, composure.view, coercion.view);

  // The 32x32 source icons render as 16x16 anchors for each gauge.
  let coercionIcon: Sprite | undefined;
  for (const placement of [
    COMPOSURE_ICON_PLACEMENT,
    COERCION_ICON_PLACEMENT,
  ] as const) {
    const url = resolveRequiredSceneAsset(assets, placement.assetKey, placement.slotId);
    if (url === undefined) continue;
    const icon = Sprite.from(url);
    applyAssetPlacement(icon, placement);
    hud.addChild(icon);
    if (placement.slotId === COERCION_ICON_PLACEMENT.slotId) coercionIcon = icon;
  }

  const slips = coercionWarningSlipCount(model.dto.resources.coercion, model.coercionMax);
  for (let index = 0; index < slips; index += 1) {
    const slip = new Graphics()
      .rect(0, 0, 8, 11)
      .fill(UI_PALETTE.paper)
      .stroke({ color: UI_PALETTE.red, width: 1 });
    slip.rotation = (index - 2) * 0.04;
    slip.position.set(506 + index * 7, 8);
    hud.addChild(slip);
  }
  const turn = createPixelText(`TURN ${model.turn.current}/${model.turn.limit}`, {
    fontSize: 9,
    fill: UI_PALETTE.parchment,
  });
  turn.position.set(552, 9);
  hud.addChild(turn);
  view.addChild(hud);
  return {
    coercionAnchor: {
      x: COERCION_ICON_PLACEMENT.x + COERCION_ICON_PLACEMENT.width / 2,
      y: COERCION_ICON_PLACEMENT.y + COERCION_ICON_PLACEMENT.height / 2,
    },
    ...(coercionIcon === undefined ? {} : { coercionIcon }),
    composureGauge: composure,
    coercionGauge: coercion,
  };
}

/**
 * Moved above the desk so the card hand owns the bottom edge of the screen.
 */
function addStatusStrip(
  view: Container,
  model: InterrogationScreenModel,
  assets: InterrogationAssetLookup | undefined,
): void {
  const strip = new Container();
  strip.position.set(0, 26);
  const plate = new Graphics().rect(0, 0, STAGE_WIDTH, 16).fill({ color: UI_PALETTE.deepInk, alpha: 0.85 });
  const points = Math.max(0, Math.round(model.dto.resources.commandPoints));
  const capacity = Math.max(points, Math.round(model.commandPointsMax ?? points));
  const cp = createPixelText('CP', { fontSize: 9, fill: UI_PALETTE.parchment });
  cp.position.set(8, 2);

  // CP used to be a row of native ☕ glyphs, which renders differently on every
  // OS and font fallback — including as a blank box in a capture. It is now the
  // approved coin, drawn at full capacity: a spent point dims rather than
  // disappearing, so the cost of the next card stays legible.
  const activeUrl = assets?.resolveOptionalUrl?.(CP_PIP_ASSET_KEYS.active);
  const spentUrl = assets?.resolveOptionalUrl?.(CP_PIP_ASSET_KEYS.deactive);
  const pips = new Container();
  pips.position.set(CP_PIP_ORIGIN_X, 2);
  for (let index = 0; index < capacity; index += 1) {
    const x = index * (CP_PIP_SIZE + CP_PIP_GAP);
    const available = index < points;
    const url = available ? activeUrl : spentUrl;
    if (url === undefined) {
      pips.addChild(
        new Graphics()
          .circle(x + CP_PIP_SIZE / 2, CP_PIP_SIZE / 2, CP_PIP_SIZE / 2 - 1)
          .fill(available ? UI_PALETTE.parchment : UI_PALETTE.panelLight),
      );
      continue;
    }
    const pip = Sprite.from(url);
    pip.position.set(x, 0);
    pip.width = CP_PIP_SIZE;
    pip.height = CP_PIP_SIZE;
    pip.eventMode = 'none';
    pips.addChild(pip);
  }
  // HP is the detective's own life, so it reads as a heart and a fraction
  // rather than the old bare `STRESS n`, which named an internal field.
  const hp = Math.max(0, Math.round(model.stress));
  const hpMax = Math.max(hp, Math.round(model.hpMax ?? hp));
  const hpLabel = createPixelText(`HP ${hp}/${hpMax}`, {
    fontSize: 9,
    fill: hp <= hpMax * 0.2 ? UI_PALETTE.red : UI_PALETTE.parchment,
  });
  hpLabel.anchor.set(1, 0);
  hpLabel.position.set(STAGE_WIDTH - 8, 3);

  const hpIconUrl = assets?.resolveOptionalUrl?.(HP_ICON_ASSET_KEY);
  const hpIcon = hpIconUrl === undefined ? undefined : Sprite.from(hpIconUrl);
  if (hpIcon !== undefined) {
    hpIcon.width = HP_ICON_SIZE;
    hpIcon.height = HP_ICON_SIZE;
    hpIcon.eventMode = 'none';
    hpIcon.position.set(STAGE_WIDTH - 8 - hpLabel.width - HP_ICON_SIZE - 3, 2);
  }

  strip.addChild(plate, cp, pips, hpLabel);
  if (hpIcon !== undefined) strip.addChild(hpIcon);
  view.addChild(strip);
}

function firstStatementText(model: InterrogationScreenModel): string {
  return model.dto.statement.find((token) => token.presentation !== 'HIDDEN')?.text ?? '진술을 기다리는 중입니다.';
}

/**
 * Which PNG each card layer draws.
 *
 * Evidence used to be picked by `handIndex % 3`, which meant the same exhibit
 * showed a different photograph depending on the order it happened to be
 * acquired in. It is now looked up by evidence id through the app layer's
 * approved table, and an id with no entry draws nothing rather than the wrong
 * thing.
 */
export function interrogationCardLayerAssetKey(
  card: InterrogationCardView,
  layer: CardLayerId,
  attachmentId: string | undefined,
  evidenceAssetKeys: Readonly<Record<string, string>> = {},
): string | undefined {
  if (layer === 'base') return CARD_BASE_ASSET_KEY;
  if (layer === 'cost') {
    return card.costIconAssetKey ??
      (card.affordable === false ? CP_PIP_ASSET_KEYS.deactive : CP_PIP_ASSET_KEYS.active);
  }
  if (layer === 'illust') {
    return card.artAssetKey ?? LEGACY_CARD_ILLUSTRATION_ASSET_KEYS[card.intent];
  }
  if (layer === 'evidence') {
    return attachmentId === undefined ? undefined : evidenceAssetKeys[attachmentId];
  }
  if (layer === 'stamp' || layer === 'post') {
    if (attachmentId === undefined) return undefined;
    // A token such as BLUE, HOW or CLIP names an overlay; an authored key that
    // already reads as `category/name/state` passes straight through.
    return CARD_ATTACHMENT_ASSET_KEYS[attachmentId] ??
      (attachmentId.includes('/') ? attachmentId : undefined);
  }
  return undefined;
}

export function interrogationCardAttachments(
  card: InterrogationCardView,
  selectedEvidenceIds: readonly string[],
  selected: boolean,
): CardAttachments {
  const base = card.attachments ?? { evidenceIds: [] };
  return {
    ...(base.stampId === undefined ? {} : { stampId: base.stampId }),
    ...(base.postId === undefined ? {} : { postId: base.postId }),
    evidenceIds: selected
      ? [...new Set([...base.evidenceIds, ...selectedEvidenceIds])]
      : [...base.evidenceIds],
  };
}

function attachmentSignature(attachments: CardAttachments): string {
  return JSON.stringify([
    attachments.stampId ?? null,
    attachments.postId ?? null,
    ...attachments.evidenceIds,
  ]);
}

export function createInterrogationScreen(
  model: InterrogationScreenModel,
  callbacks: InterrogationCallbacks = {},
  services: InterrogationScreenServices = {},
): InterrogationScreenController {
  const view = new Container();
  // Everything the screen owns lives under `content` so impact shakes can move
  // the whole scene while full-screen overlays (juice, dossier, card modal)
  // stay pinned to the stage.
  const content = new Container();
  view.addChild(content);
  addBackground(content, services.assets, model.backgroundAssetKey);
  const hudAnchors = addHud(content, model, services.assets);
  addStatusStrip(content, model, services.assets);

  const suspectStatePart = model.suspectStatePart;
  // The whole suspect is rebuilt on every submission, so the widget resolves
  // one frame for the state it is mounted in; `bootstrap` compares the state
  // across mounts and drives the shake on the container that survives.
  const portrait = createSuspectPortrait({
    label: model.suspectName,
    statePart: suspectStatePart,
    ...(model.suspectAssetSet === undefined ? {} : { assetSet: model.suspectAssetSet }),
    width: SUSPECT_PLACEMENT.width,
    height: SUSPECT_PLACEMENT.height,
    ...(services.assets === undefined
      ? {}
      : {
          resolveUrl: (key: string) =>
            resolveRequiredSceneAsset(
              services.assets,
              key,
              suspectStatePart === 'base'
                ? 'suspect-base'
                : suspectStatePart === 'upset'
                  ? 'suspect-state-parts'
                  : 'suspect-lose-parts',
            ),
        }),
  });
  applyAssetPlacement(portrait.view, SUSPECT_PLACEMENT);
  content.addChild(portrait.view);

  const tagControllers = new Map<PublicFacet, TagChipController>();
  // The tag row now overlaps the suspect's lower body on purpose: desk, chips,
  // and portrait stack into a foreground diorama. A rule marks where that
  // foreground begins so the chips never read as floating over the portrait.
  content.addChild(
    new Graphics()
      .moveTo(0, TAG_ROW_Y - 2)
      .lineTo(STAGE_WIDTH, TAG_ROW_Y - 2)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 1, alpha: 0.7 }),
  );

  const tagBounds = new Map<PublicFacet, { x: number; y: number; width: number; height: number }>();
  FACETS.forEach((facet, index) => {
    // Uniform width: the authored plate is one image, so a wider final chip
    // would stretch it. 6 x 98 at a 103 pitch spans 12..625 of the 640 stage.
    const width = TAG_CHIP_WIDTH;
    const controller = createTagChip(facet, deriveFacetTagChipState(facet, model.dto.statement), {
      width,
      height: TAG_ROW_HEIGHT,
      onSelect: () => selectFacet(facet),
      ...(services.assets === undefined
        ? {}
        : { resolveUrl: (key: string) => services.assets?.resolveOptionalUrl?.(key) }),
    });
    const x = 12 + index * TAG_CHIP_PITCH;
    controller.view.position.set(x, TAG_ROW_Y);
    tagBounds.set(facet, { x, y: TAG_ROW_Y, width, height: TAG_ROW_HEIGHT });
    const shieldToken = model.dto.statement.find(
      (token) => token.facet === facet && token.presentation !== 'HIDDEN' && token.resistance > 0,
    );
    if (shieldToken !== undefined) {
      const shield = createShield(shieldToken.resistance);
      shield.position.set(84, 5);
      controller.view.addChild(shield);
    }
    tagControllers.set(facet, controller);
    content.addChild(controller.view);
  });

  addDeskForeground(content, services.assets);

  const typewriter = createTypewriter({
    width: 320,
    height: 48,
    intervalMs: 28,
    ...(callbacks.onKeystroke === undefined ? {} : { onKeystroke: callbacks.onKeystroke }),
  });
  typewriter.view.position.set(164, DESK_TOP + DESK_TYPEWRITER_INSET);
  typewriter.useFallback(firstStatementText(model));
  content.addChild(typewriter.view);

  let selectedCardKey: string | undefined;
  let selectedCardId: string | undefined;
  let selectedInstanceId: string | undefined;
  let selectedFacet: PublicFacet | undefined;
  let selectedEvidenceIds = [...(model.selectedEvidenceIds ?? [])];
  let dossierView: Container | undefined;
  let cardModal: CardDetailModalController | undefined;
  let highlightedFacet: PublicFacet | undefined;
  let destroyed = false;
  // P0-3 secure-decision checkpoint: while the engine waits for the player's
  // Secure/Continue choice, the inline rail owns every input path. Cards,
  // tags, evidence, submit, partner, and dossier are all locked below.
  const decisionActive = model.pendingDecision !== undefined;
  const visibleCards = model.cards.slice(0, 5);
  const renderedAttachmentSignatures = new Map<string, string>();

  const attachmentsForCard = (
    card: InterrogationCardView,
    index: number,
  ): CardAttachments => interrogationCardAttachments(
    card,
    selectedEvidenceIds,
    interrogationCardKey(card, index) === selectedCardKey,
  );

  const resolveCardLayerUrl = (
    card: InterrogationCardView,
    layer: CardLayerId,
    attachmentId: string | undefined,
  ): string | undefined => {
    const key = interrogationCardLayerAssetKey(card, layer, attachmentId, model.evidenceAssetKeys);
    return key === undefined ? undefined : services.assets?.resolveUrl(key);
  };

  const resolveCardLockOverlayUrl = (card: InterrogationCardView): string | undefined => {
    const key = card.debuffAssetKey ?? CARD_LOCK_OVERLAY_ASSET_KEY;
    return services.assets?.resolveOptionalUrl?.(key) ?? services.assets?.resolveUrl(key);
  };

  const selectionSnapshot = (): InterrogationSelection => ({
    ...(selectedCardId === undefined ? {} : { cardId: selectedCardId }),
    ...(selectedInstanceId === undefined ? {} : { instanceId: selectedInstanceId }),
    ...(selectedFacet === undefined ? {} : { facet: selectedFacet }),
    evidenceIds: [...selectedEvidenceIds],
  });

  const refreshSelection = (notify = true): void => {
    const selection = selectionSnapshot();
    const selectedCard = selectedInterrogationCard(visibleCards, selection);
    if (
      selectedFacet !== undefined &&
      !interrogationCardAllowsFacet(
        selectedCard,
        selectedFacet,
        model.claimExposureByFacet?.[selectedFacet],
      )
    ) {
      selectedFacet = undefined;
    }
    cardFan.setSelected(selectedCardKey);
    visibleCards.forEach((card, index) => {
      const cardKey = interrogationCardKey(card, index);
      const attachments = attachmentsForCard(card, index);
      const signature = attachmentSignature(attachments);
      if (renderedAttachmentSignatures.get(cardKey) === signature) return;
      renderedAttachmentSignatures.set(cardKey, signature);
      cardFan.setAttachments(cardKey, attachments);
    });
    tagControllers.forEach((controller, facet) => {
      const publicState = deriveFacetTagChipState(facet, model.dto.statement);
      controller.setState(
        applyTagChipDeactivation(
          publicState,
          interrogationCardAllowsFacet(
            selectedCard,
            facet,
            model.claimExposureByFacet?.[facet],
          ) && selectedCard?.affordable !== false,
        ),
      );
      controller.setSelected(facet === selectedFacet || facet === highlightedFacet);
    });
    evidenceTray.setEvidence(model.dto.evidence, selectedEvidenceIds);
    submitButton.setEnabled(
      !decisionActive &&
        canSubmitInterrogationSelection(
          model.cards,
          selectionSnapshot(),
          model.claimExposureByFacet,
        ),
    );
    if (notify) callbacks.onSelectionChange?.(selectionSnapshot());
  };

  function selectCard(card: InterrogationCardView, index: number): void {
    if (decisionActive) return;
    selectedCardKey = interrogationCardKey(card, index);
    selectedCardId = card.cardId;
    selectedInstanceId = card.instanceId;
    refreshSelection();
  }

  function selectFacet(facet: PublicFacet): void {
    if (decisionActive) return;
    const selectedCard = selectedInterrogationCard(visibleCards, selectionSnapshot());
    if (
      !interrogationCardAllowsFacet(
        selectedCard,
        facet,
        model.claimExposureByFacet?.[facet],
      )
    ) return;
    selectedFacet = facet;
    refreshSelection();
  }

  const openDossier = (): void => {
    if (decisionActive) return;
    if (dossierView !== undefined) return;
    const close = (): void => {
      if (dossierView === undefined) return;
      view.removeChild(dossierView);
      dossierView.destroy({ children: true });
      dossierView = undefined;
    };
    const dossier = createDossierScreen({
      dto: model.dto,
      selectedEvidenceIds,
      ...(model.evidenceCosts === undefined ? {} : { evidenceCosts: model.evidenceCosts }),
      onClose: close,
      onApply(ids): void {
        selectedEvidenceIds = [...ids];
        close();
        refreshSelection();
      },
    });
    dossierView = dossier.view;
    view.addChild(dossierView);
  };

  const closeCardModal = (): void => {
    if (cardModal === undefined) return;
    view.removeChild(cardModal.view);
    cardModal.view.destroy({ children: true });
    cardModal = undefined;
  };

  const openCardModal = (card: InterrogationCardView, index: number): void => {
    if (decisionActive) return;
    closeCardModal();
    const lockOverlayUrl = card.locked === true ? resolveCardLockOverlayUrl(card) : undefined;
    cardModal = createCardDetailModal(
      {
        title: card.title,
        intent: card.intent,
        cpCost: card.cpCost,
        description: card.description,
        ...(card.combat === undefined ? {} : { roleLabel: card.combat.roleLabel }),
        ...(card.warningLabels === undefined ? {} : { warningLabels: card.warningLabels }),
        ...(card.affordable === undefined ? {} : { affordable: card.affordable }),
        ...(card.locked === undefined ? {} : { locked: card.locked }),
        ...(card.lockTurnsRemaining === undefined
          ? {}
          : { lockTurnsRemaining: card.lockTurnsRemaining }),
      },
      {
        stageWidth: STAGE_WIDTH,
        stageHeight: STAGE_HEIGHT,
        attachments: attachmentsForCard(card, index),
        ...(lockOverlayUrl === undefined ? {} : { lockOverlayUrl }),
        resolveLayerUrl: (layer, attachmentId) =>
          resolveCardLayerUrl(card, layer, attachmentId),
        onDismiss: closeCardModal,
      },
    );
    view.addChild(cardModal.view);
  };

  const evidenceTray: EvidenceTrayController = createEvidenceTray(
    model.dto.evidence,
    selectedEvidenceIds,
    {
      onOpenDossier: openDossier,
      // The same id-keyed table the card layers use, so the exhibit a player
      // picks in the pouch is the photograph that lands on the card.
      ...(model.evidenceAssetKeys === undefined
        ? {}
        : { evidenceAssetKeys: model.evidenceAssetKeys }),
      ...(services.assets === undefined
        ? {}
        : { resolveUrl: (key: string) => services.assets?.resolveOptionalUrl?.(key) }),
    },
  );
  evidenceTray.view.position.set(6, DESK_TOP + DESK_TRAY_INSET);
  content.addChild(evidenceTray.view);

  const judgmentBanner: JudgmentBannerController = createJudgmentBanner();
  content.addChild(judgmentBanner.view);

  const initialAttachments = Object.fromEntries(
    visibleCards.map((card, index) => {
      const cardKey = interrogationCardKey(card, index);
      const attachments = interrogationCardAttachments(card, [], false);
      renderedAttachmentSignatures.set(cardKey, attachmentSignature(attachments));
      return [cardKey, attachments] as const;
    }),
  );
  const cardFan: CardFanController = createCardFan(visibleCards, {
    stageWidth: STAGE_WIDTH,
    panelBottom: STAGE_HEIGHT,
    spacing: CARD_HAND_SPACING,
    attachments: initialAttachments,
    resolveLayerUrl: resolveCardLayerUrl,
    resolveLockOverlayUrl: resolveCardLockOverlayUrl,
    onSelect(card, index): void {
      selectCard(card, index);
    },
    onFocus(card, index): void {
      openCardModal(card, index);
    },
    onTargetHighlight(targetId): void {
      highlightedFacet = FACETS.find((facet) => facet === targetId);
      // Drag hover is presentation-only; it must not emit a gameplay selection.
      refreshSelection(false);
    },
    onDropOnTarget(card, targetId, index): void {
      if (decisionActive) return;
      const facet = FACETS.find((candidate) => candidate === targetId);
      if (
        facet === undefined ||
        !interrogationCardAllowsFacet(card, facet, model.claimExposureByFacet?.[facet])
      ) return;
      selectedCardKey = interrogationCardKey(card, index);
      selectedCardId = card.cardId;
      selectedInstanceId = card.instanceId;
      selectedFacet = facet;
      highlightedFacet = undefined;
      refreshSelection();
      callbacks.onCardDock?.(card.cardId, facet, card.instanceId);
    },
  });
  for (const [facet, bounds] of tagBounds) {
    cardFan.registerDropTarget({ id: facet, bounds });
  }
  const partnerBaseUrl =
    model.partnerBaseAssetKey === undefined
      ? undefined
      : resolveRequiredSceneAsset(services.assets, model.partnerBaseAssetKey, 'partner-base');
  const partnerUsedUrl =
    model.partnerUsedAssetKey === undefined
      ? undefined
      : resolveRequiredSceneAsset(services.assets, model.partnerUsedAssetKey, 'partner-used');
  const partner = createPartnerPortrait({
    label: model.partnerName,
    cooldown: model.partnerCooldown,
    width: PARTNER_PLACEMENT.width,
    height: PARTNER_PLACEMENT.height,
    ...(model.partnerSkillAvailable === true &&
    callbacks.onUsePartner !== undefined &&
    !decisionActive
      ? { onUse: callbacks.onUsePartner }
      : {}),
    ...(partnerBaseUrl === undefined ? {} : { baseUrl: partnerBaseUrl }),
    ...(partnerUsedUrl === undefined ? {} : { usedUrl: partnerUsedUrl }),
  });
  applyAssetPlacement(partner.view, PARTNER_PLACEMENT);
  content.addChild(partner.view);

  const submitButton = createActionButton('제출 / RETURN', 82, 22, () => {
    const selection = selectionSnapshot();
    if (canSubmitInterrogationSelection(model.cards, selection, model.claimExposureByFacet)) {
      callbacks.onSubmit?.(selection);
    }
  });
  submitButton.view.position.set(452, DESK_TOP + DESK_ACTION_INSET);
  content.addChild(submitButton.view);

  const secureButton = createActionButton('진술 확보', 78, 18, () => {
    if (!decisionActive) callbacks.onSecureStatement?.();
  });
  secureButton.view.position.set(452, DESK_TOP + DESK_SECURE_INSET);
  // The v2 decision rail is the single owner of Secure while it is open.
  secureButton.setEnabled(!decisionActive && model.canSecureStatement === true);
  content.addChild(secureButton.view);

  const dossierButton = createActionButton('조서 열기', 72, 18, openDossier);
  dossierButton.view.position.set(452, DESK_TOP + DESK_DOSSIER_INSET);
  dossierButton.setEnabled(!decisionActive);
  content.addChild(dossierButton.view);

  // The fan is the topmost desk interaction layer. A lifted right-hand card
  // must not lose pointer events to the dossier/submit controls beneath it.
  content.addChild(cardFan.linkView, cardFan.view);

  // Above the whole scene but below the dossier and card modal, which are
  // added to `view` only while they are open.
  const punish = createPunishJuice(
    { width: STAGE_WIDTH, height: STAGE_HEIGHT },
    {
      shakeTarget: content,
      ...(hudAnchors.coercionIcon === undefined
        ? {}
        : { pulseTarget: hudAnchors.coercionIcon }),
    },
  );
  view.addChild(punish.view);

  // Losing the suspect reuses the coercion spike's vocabulary: a scene kick
  // plus the same expanding rings, centred on the portrait.
  const loseShake = createSceneShake(content, LOSE_SCENE_SHAKE);
  const loseRings = createPulseRings({ radius: 48, colour: UI_PALETTE.red, lineWidth: 2 });
  loseRings.setCentre(
    SUSPECT_PLACEMENT.x + SUSPECT_PLACEMENT.width / 2,
    SUSPECT_PLACEMENT.y + SUSPECT_PLACEMENT.height / 2,
  );
  loseRings.update(PUNISH_TIMELINE.ringDurationMs);
  let loseRingsElapsedMs: number = PUNISH_TIMELINE.ringDurationMs;
  view.addChild(loseRings.view);

  let unbindKeyboard = (): void => undefined;
  const inputTarget = services.inputTarget ?? (typeof window === 'undefined' ? undefined : window);
  if (inputTarget !== undefined) {
    unbindKeyboard = bindSecondaryKeyboardInput(inputTarget, (command) => {
      // Full-screen overlays own input while they are open. Letting the
      // secondary bindings fall through would mutate the obscured scene (and
      // could even advance the encounter under a still-visible card modal).
      if (dossierView !== undefined || cardModal !== undefined) return;
      // The decision rail is the sole keyboard owner while it is open.
      if (decisionActive) return;
      if (command.type === 'ADVANCE') {
        callbacks.onAdvance?.();
        return;
      }
      cardFan.selectByIndex(command.cardNumber - 1);
    });
  }

  // P0-3 inline secure-decision rail: rendered where the (empty) hand sits,
  // driven by pointer or by its own Left/Right + Enter/Space keyboard owner.
  // Escape is deliberately a no-op in this slice; the dismissible DOM dialog
  // arrives in P2.
  let unbindDecisionKeys = (): void => undefined;
  const decision = model.pendingDecision;
  if (decision !== undefined) {
    // Placed on the (empty) hand area at the stage floor, below the
    // typewriter, so the reaction line stays readable (design §3.5.3).
    const railWidth = 256;
    const railHeight = 56;
    const rail = new Container();
    rail.position.set((STAGE_WIDTH - railWidth) / 2, STAGE_HEIGHT - railHeight - 4);
    const plate = new Graphics()
      .rect(0, 0, railWidth, railHeight)
      .fill(UI_PALETTE.panel)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
    rail.addChild(plate);
    const railTitle = createPixelText(decision.title, {
      fontSize: 8,
      fill: UI_PALETTE.paper,
    });
    railTitle.anchor.set(0.5, 0);
    railTitle.position.set(railWidth / 2, 6);
    rail.addChild(railTitle);

    let decisionResolved = false;
    const resolveDecision = (choice: 'SECURE' | 'CONTINUE'): void => {
      if (decisionResolved || destroyed) return;
      decisionResolved = true;
      callbacks.onResolveDecision?.(decision.decisionId, choice);
    };
    const buttonWidth = 112;
    const buttonHeight = 22;
    const buttonY = 26;
    const secureRailButton = createActionButton(
      decision.secureLabel,
      buttonWidth,
      buttonHeight,
      () => resolveDecision('SECURE'),
    );
    secureRailButton.view.position.set(8, buttonY);
    const continueRailButton = createActionButton(
      decision.continueLabel,
      buttonWidth,
      buttonHeight,
      () => resolveDecision('CONTINUE'),
    );
    continueRailButton.view.position.set(railWidth - buttonWidth - 8, buttonY);
    const focusMarker = new Graphics();
    let decisionFocus: 'SECURE' | 'CONTINUE' = 'SECURE';
    const drawDecisionFocus = (): void => {
      const focusX = decisionFocus === 'SECURE' ? 8 : railWidth - buttonWidth - 8;
      focusMarker
        .clear()
        .rect(focusX - 2, buttonY - 2, buttonWidth + 4, buttonHeight + 4)
        .stroke({ color: UI_PALETTE.paper, width: 1 });
    };
    drawDecisionFocus();
    rail.addChild(secureRailButton.view, continueRailButton.view, focusMarker);
    content.addChild(rail);

    if (inputTarget !== undefined) {
      const decisionKeyListener: EventListener = (event) => {
        if (destroyed || decisionResolved) return;
        if (!('code' in event) || typeof event.code !== 'string') return;
        // A held key from before the rail appeared must not auto-resolve the
        // decision: OS auto-repeat events are dropped like the secondary
        // keyboard bindings drop them.
        if ('repeat' in event && event.repeat === true) return;
        const code = event.code;
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          decisionFocus = decisionFocus === 'SECURE' ? 'CONTINUE' : 'SECURE';
          drawDecisionFocus();
          event.preventDefault();
          return;
        }
        if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
          event.preventDefault();
          resolveDecision(decisionFocus);
          return;
        }
        // Escape must not map to Secure or Continue (design §3.5.3).
        if (code === 'Escape') event.preventDefault();
      };
      inputTarget.addEventListener('keydown', decisionKeyListener);
      unbindDecisionKeys = () => {
        inputTarget.removeEventListener('keydown', decisionKeyListener);
      };
    }
  }
  // Construction is not a user selection. In particular, bootstrap couples
  // this callback to paper SFX, so notifying here creates a phantom click on
  // every encounter mount/remount.
  refreshSelection(false);

  return {
    view,
    get selection(): InterrogationSelection {
      return selectionSnapshot();
    },
    suspectStatePart,
    appendStatementChunk(chunk): void {
      typewriter.append(chunk);
    },
    finishStatement(): void {
      typewriter.finish();
    },
    useFallbackStatement(text): void {
      typewriter.useFallback(text);
    },
    showJudgmentFeedback(feedback): void {
      judgmentBanner.show(feedback);
    },
    clearJudgmentFeedback(): void {
      judgmentBanner.clear();
    },
    playCoercionRise(delta): void {
      punish.play(delta, hudAnchors.coercionAnchor);
    },
    playResourceImpact(change): void {
      if (change.composureDelta < 0) hudAnchors.composureGauge.playImpact();
      if (change.coercionDelta > 0) hudAnchors.coercionGauge.playImpact();
    },
    playSuspectTransition(transition): void {
      if (transition.from === transition.to) return;
      portrait.playTransitionShake(transition.to);
      if (transition.to !== 'lose') return;
      loseShake.play();
      loseRingsElapsedMs = 0;
      loseRings.update(0);
    },
    update(elapsedMs): void {
      typewriter.update(elapsedMs);
      punish.update(elapsedMs);
      hudAnchors.composureGauge.update(elapsedMs);
      hudAnchors.coercionGauge.update(elapsedMs);
      portrait.update(elapsedMs);
      loseShake.update(elapsedMs);
      if (loseRingsElapsedMs < PUNISH_TIMELINE.ringDurationMs) {
        loseRingsElapsedMs += Math.max(0, elapsedMs);
        loseRings.update(loseRingsElapsedMs);
      }
    },
    openDossier,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unbindKeyboard();
      unbindDecisionKeys();
      closeCardModal();
      cardFan.destroy();
      loseShake.release();
      punish.destroy();
      if (dossierView !== undefined) dossierView.destroy({ children: true });
    },
  };
}
