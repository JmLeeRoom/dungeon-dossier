import { catalogEntryByFileName } from '../src/ui/core/runtimeAssetCatalog';

import {
  CANONICAL_SLOTS,
  type SlotId,
  type SlotImageState,
} from './model.mts';

const EXCLUSIVE_STAGE_PREVIEW_GROUPS: readonly (readonly SlotId[])[] = [
  ['suspect-base', 'suspect-state-parts', 'suspect-lose-parts'],
  ['partner-base', 'partner-used'],
];

/**
 * Whole-frame character states share one placement and must be previewed one
 * at a time. When the inspector targets another slot, the group's base frame
 * is the stable composition default.
 */
export function isStagePreviewSlotVisible(id: SlotId, selectedId: SlotId): boolean {
  const group = EXCLUSIVE_STAGE_PREVIEW_GROUPS.find((candidate) => candidate.includes(id));
  if (group === undefined) return true;
  const selectedInGroup = group.includes(selectedId) ? selectedId : group[0];
  return id === selectedInGroup;
}

function runtimePathFromGlobPath(globPath: string): string {
  const assetsIndex = globPath.indexOf('assets/');
  if (assetsIndex < 0) {
    throw new Error(`Workbench PNG glob path is outside assets/: ${globPath}`);
  }
  return globPath.slice(assetsIndex);
}

/**
 * Resolves the shipping manifest's 16 canonical basenames to Vite URLs for
 * display only. These previews deliberately live outside WorkbenchState: a
 * hashed bundle URL is neither an uploaded PNG data URL nor saveable editor
 * state, and must never reach localStorage or the save endpoint.
 */
export function buildShippingSlotPreviews(
  discoveredPngUrls: Readonly<Record<string, string>>,
): Readonly<Record<SlotId, SlotImageState>> {
  const urlsByRuntimePath = new Map<string, string>();

  for (const [globPath, url] of Object.entries(discoveredPngUrls)) {
    const runtimePath = runtimePathFromGlobPath(globPath);
    if (urlsByRuntimePath.has(runtimePath)) {
      throw new Error(`Workbench PNG glob contains duplicate runtime path: ${runtimePath}`);
    }
    urlsByRuntimePath.set(runtimePath, url);
  }

  const previews = {} as Record<SlotId, SlotImageState>;
  for (const definition of CANONICAL_SLOTS) {
    const entry = catalogEntryByFileName(definition.manifestImage);
    if (entry === undefined) {
      throw new Error(
        `Workbench slot "${definition.id}" references uncatalogued shipping PNG: ${definition.manifestImage}`,
      );
    }

    const url = urlsByRuntimePath.get(entry.runtimePath);
    if (url === undefined) {
      throw new Error(
        `Workbench slot "${definition.id}" cannot resolve ${definition.manifestImage} at ${entry.runtimePath}`,
      );
    }

    previews[definition.id] = Object.freeze({
      dataUrl: url,
      originalName: definition.manifestImage,
    });
  }

  return Object.freeze(previews);
}
