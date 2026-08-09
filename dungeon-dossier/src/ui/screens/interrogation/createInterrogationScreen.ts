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
  createGauge,
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
  type TagChipController,
} from '../../widgets';
import {
  CARD_ATTACHMENT_ASSET_KEYS,
  CARD_BASE_ASSET_KEY,
  CARD_LOCK_OVERLAY_ASSET_KEY,
} from '../../../app/uiAssetBindings';
import { createJudgmentBanner, type JudgmentBannerController } from './judgmentBanner';
import { createPulseRings, createPunishJuice, PUNISH_TIMELINE } from './punishJuice';
import {
  canSubmitInterrogationSelection,
  interrogationCardAllowsFacet,
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
const CARD_HAND_SPACING = 76;
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
  const composure = createGauge(model.dto.resources.composure, model.composureMax, {
    width: 164,
    height: 12,
    label: '평정심',
    sweetSpotUnlocked: model.sweetSpotUnlocked,
    ...(model.sweetSpotMin === undefined ? {} : { sweetSpotMin: model.sweetSpotMin }),
    ...(model.sweetSpotMax === undefined ? {} : { sweetSpotMax: model.sweetSpotMax }),
    fill: UI_PALETTE.cyan,
  });
  composure.position.set(159, 7);
  const coercion = createGauge(model.dto.resources.coercion, model.coercionMax, {
    width: 152,
    height: 12,
    label: '강압',
    fill: UI_PALETTE.red,
    cellCount: 10,
  });
  coercion.position.set(346, 7);
  hud.addChild(plate, suspectPlate, suspect, composure, coercion);

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
  };
}

/**
 * Moved above the desk so the card hand owns the bottom edge of the screen.
 */
function addStatusStrip(view: Container, model: InterrogationScreenModel): void {
  const strip = new Container();
  strip.position.set(0, 26);
  const plate = new Graphics().rect(0, 0, STAGE_WIDTH, 16).fill({ color: UI_PALETTE.deepInk, alpha: 0.85 });
  const cp = createPixelText(`CP ${'☕'.repeat(Math.max(0, Math.round(model.dto.resources.commandPoints)))}`, {
    fontSize: 9,
    fill: UI_PALETTE.parchment,
  });
  cp.position.set(8, 3);
  const stress = createPixelText(`STRESS ${Math.max(0, Math.round(model.stress))}`, {
    fontSize: 9,
    fill: model.stress <= 20 ? UI_PALETTE.red : UI_PALETTE.parchment,
  });
  stress.anchor.set(1, 0);
  stress.position.set(STAGE_WIDTH - 8, 3);
  strip.addChild(plate, cp, stress);
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
  addStatusStrip(content, model);

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

  let selectedCardId: string | undefined;
  let selectedFacet: PublicFacet | undefined;
  let selectedEvidenceIds = [...(model.selectedEvidenceIds ?? [])];
  let dossierView: Container | undefined;
  let cardModal: CardDetailModalController | undefined;
  let highlightedFacet: PublicFacet | undefined;
  let destroyed = false;
  const visibleCards = model.cards.slice(0, 5);
  const renderedAttachmentSignatures = new Map<string, string>();

  const attachmentsForCard = (card: InterrogationCardView): CardAttachments =>
    interrogationCardAttachments(card, selectedEvidenceIds, card.cardId === selectedCardId);

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
    ...(selectedFacet === undefined ? {} : { facet: selectedFacet }),
    evidenceIds: [...selectedEvidenceIds],
  });

  const refreshSelection = (notify = true): void => {
    const selectedCard = visibleCards.find((card) => card.cardId === selectedCardId);
    if (
      selectedFacet !== undefined &&
      !interrogationCardAllowsFacet(selectedCard, selectedFacet)
    ) {
      selectedFacet = undefined;
    }
    cardFan.setSelected(selectedCardId);
    for (const card of visibleCards) {
      const attachments = attachmentsForCard(card);
      const signature = attachmentSignature(attachments);
      if (renderedAttachmentSignatures.get(card.cardId) === signature) continue;
      renderedAttachmentSignatures.set(card.cardId, signature);
      cardFan.setAttachments(card.cardId, attachments);
    }
    tagControllers.forEach((controller, facet) => {
      const publicState = deriveFacetTagChipState(facet, model.dto.statement);
      controller.setState(
        applyTagChipDeactivation(
          publicState,
          interrogationCardAllowsFacet(selectedCard, facet),
        ),
      );
      controller.setSelected(facet === selectedFacet || facet === highlightedFacet);
    });
    evidenceTray.setEvidence(model.dto.evidence, selectedEvidenceIds);
    submitButton.setEnabled(canSubmitInterrogationSelection(model.cards, selectionSnapshot()));
    if (notify) callbacks.onSelectionChange?.(selectionSnapshot());
  };

  function selectCard(cardId: string): void {
    selectedCardId = cardId;
    refreshSelection();
  }

  function selectFacet(facet: PublicFacet): void {
    const selectedCard = visibleCards.find((card) => card.cardId === selectedCardId);
    if (!interrogationCardAllowsFacet(selectedCard, facet)) return;
    selectedFacet = facet;
    refreshSelection();
  }

  const openDossier = (): void => {
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

  const openCardModal = (cardId: string): void => {
    closeCardModal();
    const card = model.cards.find((candidate) => candidate.cardId === cardId);
    if (card === undefined) return;
    const lockOverlayUrl = card.locked === true ? resolveCardLockOverlayUrl(card) : undefined;
    cardModal = createCardDetailModal(
      {
        title: card.title,
        intent: card.intent,
        cpCost: card.cpCost,
        description: card.description,
        ...(card.locked === undefined ? {} : { locked: card.locked }),
        ...(card.lockTurnsRemaining === undefined
          ? {}
          : { lockTurnsRemaining: card.lockTurnsRemaining }),
      },
      {
        stageWidth: STAGE_WIDTH,
        stageHeight: STAGE_HEIGHT,
        attachments: attachmentsForCard(card),
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
    },
  );
  evidenceTray.view.position.set(6, DESK_TOP + DESK_TRAY_INSET);
  content.addChild(evidenceTray.view);

  const judgmentBanner: JudgmentBannerController = createJudgmentBanner();
  content.addChild(judgmentBanner.view);

  const initialAttachments = Object.fromEntries(
    visibleCards.map((card) => {
      const attachments = interrogationCardAttachments(card, [], false);
      renderedAttachmentSignatures.set(card.cardId, attachmentSignature(attachments));
      return [card.cardId, attachments] as const;
    }),
  );
  const cardFan: CardFanController = createCardFan(visibleCards, {
    stageWidth: STAGE_WIDTH,
    panelBottom: STAGE_HEIGHT,
    spacing: CARD_HAND_SPACING,
    attachments: initialAttachments,
    resolveLayerUrl: resolveCardLayerUrl,
    resolveLockOverlayUrl: resolveCardLockOverlayUrl,
    onSelect(card): void {
      selectCard(card.cardId);
    },
    onFocus(card): void {
      openCardModal(card.cardId);
    },
    onTargetHighlight(targetId): void {
      highlightedFacet = FACETS.find((facet) => facet === targetId);
      // Drag hover is presentation-only; it must not emit a gameplay selection.
      refreshSelection(false);
    },
    onDropOnTarget(card, targetId): void {
      const facet = FACETS.find((candidate) => candidate === targetId);
      if (facet === undefined || !interrogationCardAllowsFacet(card, facet)) return;
      selectedCardId = card.cardId;
      selectedFacet = facet;
      highlightedFacet = undefined;
      refreshSelection();
      callbacks.onCardDock?.(card.cardId, facet);
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
    ...(model.partnerSkillAvailable === true && callbacks.onUsePartner !== undefined
      ? { onUse: callbacks.onUsePartner }
      : {}),
    ...(partnerBaseUrl === undefined ? {} : { baseUrl: partnerBaseUrl }),
    ...(partnerUsedUrl === undefined ? {} : { usedUrl: partnerUsedUrl }),
  });
  applyAssetPlacement(partner.view, PARTNER_PLACEMENT);
  content.addChild(partner.view);

  const submitButton = createActionButton('제출 / RETURN', 82, 22, () => {
    const selection = selectionSnapshot();
    if (canSubmitInterrogationSelection(model.cards, selection)) callbacks.onSubmit?.(selection);
  });
  submitButton.view.position.set(452, DESK_TOP + DESK_ACTION_INSET);
  content.addChild(submitButton.view);

  const secureButton = createActionButton('진술 확보', 78, 18, () => callbacks.onSecureStatement?.());
  secureButton.view.position.set(452, DESK_TOP + DESK_SECURE_INSET);
  secureButton.setEnabled(model.canSecureStatement === true);
  content.addChild(secureButton.view);

  const dossierButton = createActionButton('조서 열기', 72, 18, openDossier);
  dossierButton.view.position.set(452, DESK_TOP + DESK_DOSSIER_INSET);
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
      if (command.type === 'ADVANCE') {
        callbacks.onAdvance?.();
        return;
      }
      cardFan.selectByIndex(command.cardNumber - 1);
    });
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
      closeCardModal();
      cardFan.destroy();
      loseShake.release();
      punish.destroy();
      if (dossierView !== undefined) dossierView.destroy({ children: true });
    },
  };
}
