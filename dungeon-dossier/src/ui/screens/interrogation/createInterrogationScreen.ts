import { Container, Graphics, Sprite } from 'pixi.js';
import type { StatementTokenView, SuspectStatePart } from '../../../dto';
import { bindSecondaryKeyboardInput } from '../../core/input';
import { createPixelText } from '../../core/pixelText';
import { createDossierScreen } from '../dossier';
import {
  coercionWarningSlipCount,
  createCardDetailModal,
  createCardFan,
  createEvidenceTray,
  createGauge,
  createPartnerPortrait,
  createPortrait,
  createShield,
  createTagChip,
  createTypewriter,
  deriveFacetTagChipState,
  UI_PALETTE,
  type CardDetailModalController,
  type CardAttachments,
  type CardFanController,
  type CardLayerId,
  type EvidenceTrayController,
  type TagChipController,
} from '../../widgets';
import {
  canSubmitInterrogationSelection,
  type InterrogationAssetLookup,
  type InterrogationCallbacks,
  type InterrogationCardView,
  type InterrogationScreenModel,
  type InterrogationSelection,
} from './model';

type PublicFacet = StatementTokenView['facet'];

const FACETS: readonly PublicFacet[] = ['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'];

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 400;
const DESK_TOP = 282;
const TAG_ROW_Y = 250;
const TAG_ROW_HEIGHT = 26;
const CARD_HAND_SPACING = 76;
const DEFAULT_BACKGROUND_ASSET_KEY = '배경/심문실/시안';
const CARD_BASE_ASSET_KEY = 'card/기본/템플릿';
const CARD_ILLUSTRATION_ASSET_KEYS: Readonly<Record<string, string>> = {
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
const EVIDENCE_ASSET_KEYS = [
  'ev/사건/증거1',
  'ev/사건/증거2',
  'ev/사건/증거3',
] as const;

export interface InterrogationScreenServices {
  readonly assets?: InterrogationAssetLookup;
  readonly inputTarget?: EventTarget;
}

export interface InterrogationScreenController {
  readonly view: Container;
  readonly selection: InterrogationSelection;
  readonly suspectStatePart: SuspectStatePart;
  appendStatementChunk(chunk: string): void;
  finishStatement(): void;
  useFallbackStatement(text: string): void;
  update(elapsedMs: number): void;
  openDossier(): void;
  destroy(): void;
}

interface ActionButtonController {
  readonly view: Container;
  setEnabled(enabled: boolean): void;
  setLabel(label: string): void;
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
  const backgroundUrl = assets?.resolveUrl(assetKey ?? DEFAULT_BACKGROUND_ASSET_KEY);
  if (backgroundUrl !== undefined) {
    const background = Sprite.from(backgroundUrl);
    background.width = STAGE_WIDTH;
    background.height = STAGE_HEIGHT;
    view.addChild(background);
    return;
  }
  const background = new Graphics()
    .rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
    .fill(0x111b1c)
    .rect(0, 26, STAGE_WIDTH, 256)
    .fill(0x192626)
    .rect(0, 210, STAGE_WIDTH, 72)
    .fill(0x25302b)
    .moveTo(0, 210)
    .lineTo(STAGE_WIDTH, 210)
    .stroke({ color: UI_PALETTE.panelLight, width: 2 });
  for (let x = 0; x < STAGE_WIDTH; x += 40) {
    background.moveTo(x, 26).lineTo(x, DESK_TOP).stroke({ color: 0x203130, width: 1 });
  }
  view.addChild(background);
}

/** The 1280x236 desk plate, drawn at half scale over the stage floor. */
function addDeskForeground(view: Container, assets: InterrogationAssetLookup | undefined): void {
  const deskUrl = assets?.resolveUrl('전경/책상/기본');
  if (deskUrl !== undefined) {
    const desk = Sprite.from(deskUrl);
    desk.position.set(0, DESK_TOP);
    desk.width = STAGE_WIDTH;
    desk.height = STAGE_HEIGHT - DESK_TOP;
    view.addChild(desk);
    return;
  }
  view.addChild(
    new Graphics()
      .rect(0, DESK_TOP, STAGE_WIDTH, STAGE_HEIGHT - DESK_TOP)
      .fill({ color: UI_PALETTE.panel, alpha: 0.88 })
      .moveTo(0, DESK_TOP)
      .lineTo(STAGE_WIDTH, DESK_TOP)
      .stroke({ color: UI_PALETTE.parchmentDark, width: 2 }),
  );
}

function addHud(view: Container, model: InterrogationScreenModel, assets: InterrogationAssetLookup | undefined): void {
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
  for (const [key, x] of [
    ['아이콘/평정심/기본', 139],
    ['아이콘/강압/기본', 326],
  ] as const) {
    const url = assets?.resolveUrl(key);
    if (url === undefined) continue;
    const icon = Sprite.from(url);
    icon.position.set(x, 5);
    icon.width = 16;
    icon.height = 16;
    hud.addChild(icon);
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

export function interrogationCardLayerAssetKey(
  card: InterrogationCardView,
  layer: CardLayerId,
  attachmentId: string | undefined,
  evidence: InterrogationScreenModel['dto']['evidence'],
): string | undefined {
  if (layer === 'base') return CARD_BASE_ASSET_KEY;
  if (layer === 'illust') {
    return card.artAssetKey ?? CARD_ILLUSTRATION_ASSET_KEYS[card.intent];
  }
  if (layer === 'evidence' && attachmentId !== undefined) {
    const evidenceIndex = evidence.findIndex((item) => item.evidenceId === attachmentId);
    const assetIndex = evidenceIndex < 0 ? 0 : evidenceIndex % EVIDENCE_ASSET_KEYS.length;
    return EVIDENCE_ASSET_KEYS[assetIndex];
  }
  // Stamp/post IDs such as BLUE, RED, HOW, or CLIP are presentation tokens.
  // If authored art later supplies a registry key it can pass that key through;
  // otherwise cardArtwork renders the built-in placeholder for the layer.
  if ((layer === 'stamp' || layer === 'post') && attachmentId?.includes('/') === true) {
    return attachmentId;
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
  addBackground(view, services.assets, model.backgroundAssetKey);
  addHud(view, model, services.assets);
  addStatusStrip(view, model);

  const suspectStatePart = model.suspectStatePart;
  const baseUrl =
    model.portraitBaseAssetKey === undefined
      ? undefined
      : services.assets?.resolveUrl(model.portraitBaseAssetKey);
  const statePartsKey = suspectStatePart === 'base'
    ? undefined
    : model.portraitStatePartsAssetKeys?.[suspectStatePart];
  const statePartsUrl =
    statePartsKey === undefined ? undefined : services.assets?.resolveUrl(statePartsKey);
  const portrait = createPortrait({
    label: model.suspectName,
    statePart: suspectStatePart,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(statePartsUrl === undefined ? {} : { statePartsUrl }),
  });
  portrait.position.set(212, 34);
  view.addChild(portrait);

  const tagControllers = new Map<PublicFacet, TagChipController>();
  const tagBounds = new Map<PublicFacet, { x: number; y: number; width: number; height: number }>();
  FACETS.forEach((facet, index) => {
    const width = index === FACETS.length - 1 ? 101 : 99;
    const controller = createTagChip(facet, deriveFacetTagChipState(facet, model.dto.statement), {
      width,
      height: TAG_ROW_HEIGHT,
      onSelect: () => selectFacet(facet),
    });
    const x = 12 + index * 103;
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
    view.addChild(controller.view);
  });

  addDeskForeground(view, services.assets);

  const typewriter = createTypewriter({
    width: 320,
    height: 48,
    intervalMs: 28,
    ...(callbacks.onKeystroke === undefined ? {} : { onKeystroke: callbacks.onKeystroke }),
  });
  typewriter.view.position.set(164, 288);
  typewriter.useFallback(firstStatementText(model));
  view.addChild(typewriter.view);

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
    const key = interrogationCardLayerAssetKey(card, layer, attachmentId, model.dto.evidence);
    return key === undefined ? undefined : services.assets?.resolveUrl(key);
  };

  const selectionSnapshot = (): InterrogationSelection => ({
    ...(selectedCardId === undefined ? {} : { cardId: selectedCardId }),
    ...(selectedFacet === undefined ? {} : { facet: selectedFacet }),
    evidenceIds: [...selectedEvidenceIds],
  });

  const refreshSelection = (notify = true): void => {
    cardFan.setSelected(selectedCardId);
    for (const card of visibleCards) {
      const attachments = attachmentsForCard(card);
      const signature = attachmentSignature(attachments);
      if (renderedAttachmentSignatures.get(card.cardId) === signature) continue;
      renderedAttachmentSignatures.set(card.cardId, signature);
      cardFan.setAttachments(card.cardId, attachments);
    }
    tagControllers.forEach((controller, facet) =>
      controller.setSelected(facet === selectedFacet || facet === highlightedFacet),
    );
    evidenceTray.setEvidence(model.dto.evidence, selectedEvidenceIds);
    submitButton.setEnabled(canSubmitInterrogationSelection(model.cards, selectionSnapshot()));
    if (notify) callbacks.onSelectionChange?.(selectionSnapshot());
  };

  function selectCard(cardId: string): void {
    selectedCardId = cardId;
    refreshSelection();
  }

  function selectFacet(facet: PublicFacet): void {
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
    cardModal = createCardDetailModal(
      {
        title: card.title,
        intent: card.intent,
        cpCost: card.cpCost,
        description: card.description,
      },
      {
        stageWidth: STAGE_WIDTH,
        stageHeight: STAGE_HEIGHT,
        attachments: attachmentsForCard(card),
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
  evidenceTray.view.position.set(6, 292);
  view.addChild(evidenceTray.view);

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
      if (facet === undefined) return;
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
      : services.assets?.resolveUrl(model.partnerBaseAssetKey);
  const partnerUsedUrl =
    model.partnerUsedAssetKey === undefined
      ? undefined
      : services.assets?.resolveUrl(model.partnerUsedAssetKey);
  const partner = createPartnerPortrait({
    label: model.partnerName,
    cooldown: model.partnerCooldown,
    ...(model.partnerSkillAvailable === true && callbacks.onUsePartner !== undefined
      ? { onUse: callbacks.onUsePartner }
      : {}),
    ...(partnerBaseUrl === undefined ? {} : { baseUrl: partnerBaseUrl }),
    ...(partnerUsedUrl === undefined ? {} : { usedUrl: partnerUsedUrl }),
  });
  partner.view.position.set(546, 296);
  view.addChild(partner.view);

  const submitButton = createActionButton('제출 / RETURN', 82, 22, () => {
    const selection = selectionSnapshot();
    if (canSubmitInterrogationSelection(model.cards, selection)) callbacks.onSubmit?.(selection);
  });
  submitButton.view.position.set(452, 296);
  view.addChild(submitButton.view);

  const secureButton = createActionButton('진술 확보', 78, 18, () => callbacks.onSecureStatement?.());
  secureButton.view.position.set(452, 322);
  secureButton.setEnabled(model.canSecureStatement === true);
  view.addChild(secureButton.view);

  const dossierButton = createActionButton('조서 열기', 72, 18, openDossier);
  dossierButton.view.position.set(452, 344);
  view.addChild(dossierButton.view);

  // The fan is the topmost desk interaction layer. A lifted right-hand card
  // must not lose pointer events to the dossier/submit controls beneath it.
  view.addChild(cardFan.linkView, cardFan.view);

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
    update(elapsedMs): void {
      typewriter.update(elapsedMs);
    },
    openDossier,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unbindKeyboard();
      closeCardModal();
      cardFan.destroy();
      if (dossierView !== undefined) dossierView.destroy({ children: true });
    },
  };
}
