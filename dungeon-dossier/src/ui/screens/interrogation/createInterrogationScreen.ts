import { Container, Graphics, Sprite } from 'pixi.js';
import type { StatementTokenView } from '../../../dto';
import { bindSecondaryKeyboardInput } from '../../core/input';
import { createPixelText } from '../../core/pixelText';
import { createDossierScreen } from '../dossier';
import {
  coercionWarningSlipCount,
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
  type CardFanController,
  type EvidenceTrayController,
  type TagChipController,
} from '../../widgets';
import {
  canSubmitInterrogationSelection,
  type InterrogationAssetLookup,
  type InterrogationCallbacks,
  type InterrogationScreenModel,
  type InterrogationSelection,
} from './model';

type PublicFacet = StatementTokenView['facet'];

const FACETS: readonly PublicFacet[] = ['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'];

export interface InterrogationScreenServices {
  readonly assets?: InterrogationAssetLookup;
  readonly inputTarget?: EventTarget;
}

export interface InterrogationScreenController {
  readonly view: Container;
  readonly selection: InterrogationSelection;
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

function addBackground(view: Container, assets: InterrogationAssetLookup | undefined): void {
  const backgroundUrl = assets?.resolveUrl('배경/심문실/시안');
  if (backgroundUrl !== undefined) {
    const background = Sprite.from(backgroundUrl);
    background.width = 640;
    background.height = 400;
    view.addChild(background);
    return;
  }
  const background = new Graphics()
    .rect(0, 0, 640, 400)
    .fill(0x111b1c)
    .rect(0, 26, 640, 256)
    .fill(0x192626)
    .rect(0, 210, 640, 72)
    .fill(0x25302b)
    .moveTo(0, 210)
    .lineTo(640, 210)
    .stroke({ color: UI_PALETTE.panelLight, width: 2 });
  for (let x = 0; x < 640; x += 40) {
    background.moveTo(x, 26).lineTo(x, 282).stroke({ color: 0x203130, width: 1 });
  }
  view.addChild(background);
}

function addHud(view: Container, model: InterrogationScreenModel): void {
  const hud = new Container();
  const plate = new Graphics().rect(0, 0, 640, 26).fill({ color: UI_PALETTE.deepInk, alpha: 0.94 });
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
    width: 180,
    height: 12,
    label: '평정심',
    sweetSpotUnlocked: model.sweetSpotUnlocked,
    fill: UI_PALETTE.cyan,
  });
  composure.position.set(143, 7);
  const coercion = createGauge(model.dto.resources.coercion, model.coercionMax, {
    width: 168,
    height: 12,
    label: '강압',
    fill: UI_PALETTE.red,
    cellCount: 10,
  });
  coercion.position.set(330, 7);
  const slips = coercionWarningSlipCount(model.dto.resources.coercion, model.coercionMax);
  for (let index = 0; index < slips; index += 1) {
    const slip = new Graphics()
      .rect(0, 0, 8, 11)
      .fill(UI_PALETTE.paper)
      .stroke({ color: UI_PALETTE.red, width: 1 });
    slip.rotation = (index - 2) * 0.04;
    slip.position.set(502 + index * 7, 8);
    hud.addChild(slip);
  }
  const turn = createPixelText(`TURN ${model.turn.current}/${model.turn.limit}`, {
    fontSize: 9,
    fill: UI_PALETTE.parchment,
  });
  turn.position.set(552, 9);
  hud.addChild(plate, suspectPlate, suspect, composure, coercion, turn);
  view.addChild(hud);
}

function addStatusStrip(view: Container, model: InterrogationScreenModel): void {
  const strip = new Container();
  strip.position.set(0, 380);
  const plate = new Graphics().rect(0, 0, 640, 20).fill({ color: UI_PALETTE.deepInk, alpha: 0.95 });
  const cp = createPixelText(`CP ${'☕'.repeat(Math.max(0, Math.round(model.dto.resources.commandPoints)))}`, {
    fontSize: 9,
    fill: UI_PALETTE.parchment,
  });
  cp.position.set(160, 5);
  const stress = createPixelText(`STRESS ${Math.max(0, Math.round(model.stress))}`, {
    fontSize: 9,
    fill: model.stress <= 20 ? UI_PALETTE.red : UI_PALETTE.parchment,
  });
  stress.position.set(405, 5);
  strip.addChild(plate, cp, stress);
  view.addChild(strip);
}

function firstStatementText(model: InterrogationScreenModel): string {
  return model.dto.statement.find((token) => token.presentation !== 'HIDDEN')?.text ?? '진술을 기다리는 중입니다.';
}

export function createInterrogationScreen(
  model: InterrogationScreenModel,
  callbacks: InterrogationCallbacks = {},
  services: InterrogationScreenServices = {},
): InterrogationScreenController {
  const view = new Container();
  addBackground(view, services.assets);
  addHud(view, model);

  const baseUrl =
    model.portraitBaseAssetKey === undefined
      ? undefined
      : services.assets?.resolveUrl(model.portraitBaseAssetKey);
  const partsUrl =
    model.portraitPartsAssetKey === undefined
      ? undefined
      : services.assets?.resolveUrl(model.portraitPartsAssetKey);
  const portrait = createPortrait({
    label: model.suspectName,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(partsUrl === undefined ? {} : { partsUrl }),
  });
  portrait.position.set(222, 40);
  view.addChild(portrait);

  const tagControllers = new Map<PublicFacet, TagChipController>();
  FACETS.forEach((facet, index) => {
    const controller = createTagChip(facet, deriveFacetTagChipState(facet, model.dto.statement), {
      width: index === FACETS.length - 1 ? 101 : 99,
      height: 26,
      onSelect: () => selectFacet(facet),
    });
    controller.view.position.set(12 + index * 103, 256);
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

  const desk = new Graphics()
    .rect(0, 282, 640, 118)
    .fill({ color: UI_PALETTE.panel, alpha: 0.88 })
    .moveTo(0, 282)
    .lineTo(640, 282)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 2 });
  view.addChild(desk);

  const typewriter = createTypewriter({
    width: 436,
    height: 56,
    intervalMs: 28,
    ...(callbacks.onKeystroke === undefined ? {} : { onKeystroke: callbacks.onKeystroke }),
  });
  typewriter.view.position.set(110, 290);
  typewriter.useFallback(firstStatementText(model));
  view.addChild(typewriter.view);

  let selectedCardId: string | undefined;
  let selectedFacet: PublicFacet | undefined;
  let selectedEvidenceIds = [...(model.selectedEvidenceIds ?? [])];
  let dossierView: Container | undefined;
  let destroyed = false;

  const selectionSnapshot = (): InterrogationSelection => ({
    ...(selectedCardId === undefined ? {} : { cardId: selectedCardId }),
    ...(selectedFacet === undefined ? {} : { facet: selectedFacet }),
    evidenceIds: [...selectedEvidenceIds],
  });

  const refreshSelection = (): void => {
    cardFan.setSelected(selectedCardId);
    tagControllers.forEach((controller, facet) => controller.setSelected(facet === selectedFacet));
    evidenceTray.setEvidence(model.dto.evidence, selectedEvidenceIds);
    submitButton.setEnabled(canSubmitInterrogationSelection(model.cards, selectionSnapshot()));
    callbacks.onSelectionChange?.(selectionSnapshot());
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

  const evidenceTray: EvidenceTrayController = createEvidenceTray(
    model.dto.evidence,
    selectedEvidenceIds,
    {
    onOpenDossier: openDossier,
    },
  );
  evidenceTray.view.position.set(6, 346);
  view.addChild(evidenceTray.view);

  const cardFan: CardFanController = createCardFan(model.cards.slice(0, 5), {
    onSelect(card): void {
      selectCard(card.cardId);
    },
  });
  cardFan.view.position.set(178, 326);
  view.addChild(cardFan.view);

  const partner = createPartnerPortrait(
    model.partnerName,
    model.partnerAssetKey === undefined
      ? undefined
      : services.assets?.resolveUrl(model.partnerAssetKey),
  );
  partner.position.set(554, 302);
  view.addChild(partner);

  const submitButton = createActionButton('제출 / RETURN', 82, 22, () => {
    const selection = selectionSnapshot();
    if (canSubmitInterrogationSelection(model.cards, selection)) callbacks.onSubmit?.(selection);
  });
  submitButton.view.position.set(464, 350);
  view.addChild(submitButton.view);

  const secureButton = createActionButton('진술 확보', 78, 18, () => callbacks.onSecureStatement?.());
  secureButton.view.position.set(468, 368);
  secureButton.setEnabled(model.canSecureStatement === true);
  view.addChild(secureButton.view);

  addStatusStrip(view, model);
  const dossierButton = createActionButton('조서 열기', 72, 18, openDossier);
  dossierButton.view.position.set(558, 381);
  view.addChild(dossierButton.view);

  let unbindKeyboard = (): void => undefined;
  const inputTarget = services.inputTarget ?? (typeof window === 'undefined' ? undefined : window);
  if (inputTarget !== undefined) {
    unbindKeyboard = bindSecondaryKeyboardInput(inputTarget, (command) => {
      if (command.type === 'ADVANCE') {
        callbacks.onAdvance?.();
        return;
      }
      cardFan.selectByIndex(command.cardNumber - 1);
    });
  }
  refreshSelection();

  return {
    view,
    get selection(): InterrogationSelection {
      return selectionSnapshot();
    },
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
      if (dossierView !== undefined) dossierView.destroy({ children: true });
    },
  };
}
