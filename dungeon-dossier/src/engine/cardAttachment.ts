/**
 * Interrogation cards are composited from five stacked parts. `base` and
 * `illust` are always present; the upper three are docked at runtime as the
 * encounter grants stamps, post overlays, and combined evidence.
 */
export const CARD_LAYER_IDS = ['base', 'illust', 'stamp', 'post', 'evidence'] as const;
export type CardLayerId = (typeof CARD_LAYER_IDS)[number];

export const CARD_LAYER_Z_INDEX: Readonly<Record<CardLayerId, number>> = {
  base: 0,
  illust: 1,
  stamp: 2,
  post: 3,
  evidence: 4,
};

export const CARD_PERMANENT_LAYER_IDS = ['base', 'illust'] as const;
export const CARD_ATTACHABLE_LAYER_IDS = ['stamp', 'post', 'evidence'] as const;

export const DEFAULT_MAX_CARD_EVIDENCE = 3;

export interface CardAttachments {
  readonly stampId: string | undefined;
  readonly postId: string | undefined;
  readonly evidenceIds: readonly string[];
}

export interface CardLayerSlot {
  readonly layer: CardLayerId;
  readonly zIndex: number;
  /** The attached identifier, or undefined for the always-present card art. */
  readonly attachmentId: string | undefined;
}

export function createCardAttachments(): CardAttachments {
  return { stampId: undefined, postId: undefined, evidenceIds: [] };
}

export function attachStamp(attachments: CardAttachments, stampId: string): CardAttachments {
  return { ...attachments, stampId };
}

export function attachPost(attachments: CardAttachments, postId: string): CardAttachments {
  return { ...attachments, postId };
}

export function detachStamp(attachments: CardAttachments): CardAttachments {
  return { ...attachments, stampId: undefined };
}

export function detachPost(attachments: CardAttachments): CardAttachments {
  return { ...attachments, postId: undefined };
}

/** Docking the same evidence twice is a no-op rather than a duplicated layer. */
export function attachEvidence(
  attachments: CardAttachments,
  evidenceId: string,
  maxEvidence: number = DEFAULT_MAX_CARD_EVIDENCE,
): CardAttachments {
  if (attachments.evidenceIds.includes(evidenceId)) return attachments;
  const limit = Number.isFinite(maxEvidence) ? Math.max(0, Math.floor(maxEvidence)) : 0;
  if (attachments.evidenceIds.length >= limit) return attachments;
  return { ...attachments, evidenceIds: [...attachments.evidenceIds, evidenceId] };
}

export function detachEvidence(
  attachments: CardAttachments,
  evidenceId: string,
): CardAttachments {
  if (!attachments.evidenceIds.includes(evidenceId)) return attachments;
  return {
    ...attachments,
    evidenceIds: attachments.evidenceIds.filter((id) => id !== evidenceId),
  };
}

/**
 * The render order contract: ascending z-index, permanent parts first, and one
 * `evidence` slot per docked item so the renderer never has to sort.
 */
export function buildCardLayerStack(
  attachments: CardAttachments = createCardAttachments(),
): readonly CardLayerSlot[] {
  const slots: CardLayerSlot[] = [
    { layer: 'base', zIndex: CARD_LAYER_Z_INDEX.base, attachmentId: undefined },
    { layer: 'illust', zIndex: CARD_LAYER_Z_INDEX.illust, attachmentId: undefined },
  ];
  if (attachments.stampId !== undefined) {
    slots.push({ layer: 'stamp', zIndex: CARD_LAYER_Z_INDEX.stamp, attachmentId: attachments.stampId });
  }
  if (attachments.postId !== undefined) {
    slots.push({ layer: 'post', zIndex: CARD_LAYER_Z_INDEX.post, attachmentId: attachments.postId });
  }
  for (const evidenceId of attachments.evidenceIds) {
    slots.push({
      layer: 'evidence',
      zIndex: CARD_LAYER_Z_INDEX.evidence,
      attachmentId: evidenceId,
    });
  }
  return slots;
}

export function isCardLayerId(value: string): value is CardLayerId {
  return (CARD_LAYER_IDS as readonly string[]).includes(value);
}
