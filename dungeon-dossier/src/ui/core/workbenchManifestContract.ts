import type { AssetDimensionId } from './assetDimensions.ts';

export const WORKBENCH_SLOT_IDS = [
  'bg-room',
  'suspect-base',
  'suspect-state-parts',
  'suspect-lose-parts',
  'fg-desk',
  'card-base',
  'card-art-1',
  'card-art-2',
  'card-art-3',
  'ev-1',
  'ev-2',
  'ev-3',
  'icon-composure',
  'icon-coercion',
  'partner-base',
  'partner-used',
] as const;

export type WorkbenchSlotId = (typeof WORKBENCH_SLOT_IDS)[number];

export interface WorkbenchManifestSlotContract {
  readonly dimension: AssetDimensionId;
  readonly manifestImage: string;
}

/**
 * Shared topology contract for the browser workbench, save endpoint and
 * shipping manifest. Keeping the canonical basename beside its dimension is
 * what prevents a partial editor save from replacing the runtime manifest
 * with a structurally valid but unbootable document.
 */
export const WORKBENCH_MANIFEST_SLOTS = {
  'bg-room': { dimension: 'bg_interrogation', manifestImage: 'bg_interrogationroom_base.png' },
  'suspect-base': { dimension: 'suspect_base', manifestImage: 'idle_mulkung_base.png' },
  'suspect-state-parts': {
    dimension: 'suspect_state_parts',
    manifestImage: 'idle_mulkung_upset.png',
  },
  'suspect-lose-parts': {
    dimension: 'suspect_state_parts',
    manifestImage: 'idle_mulkung_lose.png',
  },
  'fg-desk': { dimension: 'desk_foreground', manifestImage: 'bg_interrogationroom_desk.png' },
  'card-base': { dimension: 'card_base_768x1024', manifestImage: 'ui_card_base.png' },
  'card-art-1': { dimension: 'card_illust', manifestImage: 'ui_card_illust00.png' },
  'card-art-2': { dimension: 'card_illust', manifestImage: 'ui_card_illust01.png' },
  'card-art-3': { dimension: 'card_illust', manifestImage: 'ui_card_illust02.png' },
  'ev-1': { dimension: 'card_evidence_256', manifestImage: 'ui_card_evidence00.png' },
  'ev-2': { dimension: 'card_evidence_256', manifestImage: 'ui_card_evidence01.png' },
  'ev-3': { dimension: 'card_evidence_256', manifestImage: 'ui_card_evidence02.png' },
  'icon-composure': { dimension: 'icon_composure', manifestImage: 'ui_icon_composure.png' },
  'icon-coercion': { dimension: 'icon_coercion', manifestImage: 'ui_icon_pushy.png' },
  'partner-base': { dimension: 'partner', manifestImage: 'idle_coffee_base.png' },
  'partner-used': { dimension: 'partner', manifestImage: 'idle_coffee_used.png' },
} as const satisfies Readonly<Record<WorkbenchSlotId, WorkbenchManifestSlotContract>>;
