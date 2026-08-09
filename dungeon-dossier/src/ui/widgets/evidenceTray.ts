import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { EvidenceView } from '../../dto';
import { ASSET_DIMENSIONS } from '../core/assetDimensions';
import { containImage } from '../core/imageFit';
import { createPixelText } from '../core/pixelText';
import { UI_PALETTE } from './theme';

/** Slot geometry, matching the canonical `ev-1..3` manifest placements. */
export const EVIDENCE_SLOT_SIZE = 36;
const EVIDENCE_SLOT_PITCH = 40;
/** Inset so the polaroid sits inside the slot's own frame stroke. */
const EVIDENCE_THUMBNAIL_INSET = 2;

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
  /**
   * Authored evidence id to polaroid key, the same table the card layers use.
   * Without it the tray keeps showing grade letters.
   */
  readonly evidenceAssetKeys?: Readonly<Record<string, string>>;
  /** Resolves an evidence key to a URL; a miss leaves the slot as a letter. */
  readonly resolveUrl?: (key: string) => string | undefined;
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

  const thumbnailRect = containImage(ASSET_DIMENSIONS.card_evidence_256, {
    x: EVIDENCE_THUMBNAIL_INSET,
    y: EVIDENCE_THUMBNAIL_INSET,
    width: EVIDENCE_SLOT_SIZE - EVIDENCE_THUMBNAIL_INSET * 2,
    height: EVIDENCE_SLOT_SIZE - EVIDENCE_THUMBNAIL_INSET * 2,
  });

  const slotViews = Array.from({ length: 3 }, (_, index) => {
    const slot = new Container();
    slot.position.set(6 + index * EVIDENCE_SLOT_PITCH, 14);
    const plate = new Graphics();
    // One reusable sprite per slot: the tray re-renders on every selection
    // change, and rebuilding a texture each time would churn the cache.
    const thumbnail = new Sprite();
    thumbnail.position.set(thumbnailRect.x, thumbnailRect.y);
    thumbnail.width = thumbnailRect.width;
    thumbnail.height = thumbnailRect.height;
    thumbnail.eventMode = 'none';
    thumbnail.visible = false;
    const label = createPixelText('+', { fontSize: 11, fill: UI_PALETTE.muted });
    label.anchor.set(0.5);
    label.position.set(EVIDENCE_SLOT_SIZE / 2, EVIDENCE_SLOT_SIZE / 2);
    slot.addChild(plate, thumbnail, label);
    if (options.onOpenDossier !== undefined) {
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.on('pointertap', () => options.onOpenDossier?.());
    }
    view.addChild(slot);
    return { plate, thumbnail, label };
  });

  const thumbnailUrl = (evidence: EvidenceView | undefined): string | undefined => {
    if (evidence === undefined) return undefined;
    const key = options.evidenceAssetKeys?.[evidence.evidenceId];
    return key === undefined ? undefined : options.resolveUrl?.(key);
  };

  const render = (items: readonly EvidenceView[], ids: readonly string[]): void => {
    const slots = buildEvidenceTraySlots(items, ids);
    slots.forEach((slot, index) => {
      const slotView = slotViews[index];
      if (slotView === undefined) return;
      slotView.plate
        .clear()
        .rect(0, 0, EVIDENCE_SLOT_SIZE, EVIDENCE_SLOT_SIZE)
        .fill(UI_PALETTE.panel)
        .stroke({ color: slot.selected ? UI_PALETTE.cyan : UI_PALETTE.panelLight, width: 1 });

      const url = thumbnailUrl(slot.evidence);
      if (url === undefined) {
        slotView.thumbnail.visible = false;
      } else {
        slotView.thumbnail.texture = Texture.from(url);
        slotView.thumbnail.visible = true;
      }
      // With a photograph in the slot the grade moves to a corner tag so the
      // exhibit stays recognisable; without one it is all the slot has.
      slotView.label.text = slot.evidence?.grade ?? '+';
      slotView.label.tint = slot.evidence === undefined ? UI_PALETTE.muted : UI_PALETTE.paper;
      slotView.label.anchor.set(url === undefined ? 0.5 : 1);
      slotView.label.position.set(
        url === undefined ? EVIDENCE_SLOT_SIZE / 2 : EVIDENCE_SLOT_SIZE - 2,
        url === undefined ? EVIDENCE_SLOT_SIZE / 2 : EVIDENCE_SLOT_SIZE - 2,
      );
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
