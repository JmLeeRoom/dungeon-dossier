import { Container, Graphics } from 'pixi.js';
import type { EvidenceView } from '../../dto';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

export interface EvidenceTraySlot {
  readonly index: number;
  readonly evidence: EvidenceView | undefined;
  readonly selected: boolean;
}

export function buildEvidenceTraySlots(
  evidence: readonly EvidenceView[],
  selectedIds: readonly string[],
  slotCount = 3,
): readonly EvidenceTraySlot[] {
  const selected = new Set(selectedIds);
  const selectedEvidence = selectedIds
    .map((id) => evidence.find((item) => item.evidenceId === id))
    .filter((item): item is EvidenceView => item !== undefined);
  return Array.from({ length: Math.max(0, slotCount) }, (_, index) => ({
    index,
    evidence: selectedEvidence[index],
    selected: selectedEvidence[index] !== undefined && selected.has(selectedEvidence[index].evidenceId),
  }));
}

export interface EvidenceTrayController {
  readonly view: Container;
  setEvidence(evidence: readonly EvidenceView[], selectedIds: readonly string[]): void;
}

export interface EvidenceTrayOptions {
  readonly onOpenDossier?: () => void;
}

export function createEvidenceTray(
  evidence: readonly EvidenceView[],
  selectedIds: readonly string[],
  options: EvidenceTrayOptions = {},
): EvidenceTrayController {
  const view = new Container();
  const pouch = new Graphics()
    .poly([0, 7, 146, 0, 150, 49, 4, 52])
    .fill(UI_PALETTE.parchmentDark)
    .stroke({ color: UI_PALETTE.panelLight, width: 2 });
  const caseLabel = createPixelText('증거 파우치', { fontSize: 8, fill: UI_PALETTE.ink });
  caseLabel.position.set(6, 3);
  view.addChild(pouch, caseLabel);

  const slotViews = Array.from({ length: 3 }, (_, index) => {
    const slot = new Container();
    slot.position.set(6 + index * 40, 14);
    const plate = new Graphics();
    const label = createPixelText('+', { fontSize: 11, fill: UI_PALETTE.muted });
    label.anchor.set(0.5);
    label.position.set(18, 18);
    slot.addChild(plate, label);
    if (options.onOpenDossier !== undefined) {
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.on('pointertap', () => options.onOpenDossier?.());
    }
    view.addChild(slot);
    return { plate, label };
  });

  const render = (items: readonly EvidenceView[], ids: readonly string[]): void => {
    const slots = buildEvidenceTraySlots(items, ids);
    slots.forEach((slot, index) => {
      const slotView = slotViews[index];
      if (slotView === undefined) return;
      slotView.plate
        .clear()
        .rect(0, 0, 36, 36)
        .fill(UI_PALETTE.panel)
        .stroke({ color: slot.selected ? UI_PALETTE.cyan : UI_PALETTE.panelLight, width: 1 });
      slotView.label.text = slot.evidence?.grade ?? '+';
      slotView.label.tint = slot.evidence === undefined ? UI_PALETTE.muted : UI_PALETTE.paper;
    });
  };
  render(evidence, selectedIds);

  return {
    view,
    setEvidence(items, ids): void {
      render(items, ids);
    },
  };
}
