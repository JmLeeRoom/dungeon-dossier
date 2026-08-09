import canonicalManifestJson from '../../../assets/asset_manifest.json';

import { assetDimension, type AssetDimensionId } from './assetDimensions';
import {
  parseAssetManifest,
  resolveTransformSize,
  type AssetManifest,
  type AssetTransform,
} from './assetManifest';
import { catalogEntryByFileName, type AssetKey } from './runtimeAssetCatalog';
import { runtimeAssetUrl } from './runtimeAssetRegistry';

export const CANONICAL_ASSET_MANIFEST: AssetManifest = parseAssetManifest(canonicalManifestJson);

export interface AssetPlacement {
  readonly slotId: string;
  readonly dimension: AssetDimensionId;
  readonly imageFileName: string;
  readonly assetKey: AssetKey;
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly transform: AssetTransform;
  readonly isLocked: boolean;
}

export interface PlacementTarget {
  readonly position: { set(x: number, y: number): void };
  width: number;
  height: number;
  rotation: number;
}

export function buildPlacementRegistry(
  manifest: AssetManifest = CANONICAL_ASSET_MANIFEST,
  resolveUrl: (key: AssetKey) => string | undefined = runtimeAssetUrl,
): ReadonlyMap<string, AssetPlacement> {
  const placements = new Map<string, AssetPlacement>();

  for (const [slotId, slot] of Object.entries(manifest.slots)) {
    if (slot.image === null) continue;
    const entry = catalogEntryByFileName(slot.image);
    if (entry === undefined) {
      throw new Error(`Asset placement "${slotId}" references uncatalogued image "${slot.image}".`);
    }
    const source = assetDimension(slot.dimension);
    if (source.width !== entry.width || source.height !== entry.height) {
      throw new Error(
        `Asset placement "${slotId}" declares ${slot.dimension} (${source.width}x${source.height}) ` +
          `for ${slot.image} (${entry.width}x${entry.height}).`,
      );
    }
    const url = resolveUrl(entry.key);
    if (url === undefined) {
      throw new Error(`Asset placement "${slotId}" cannot resolve runtime key "${entry.key}".`);
    }
    const size = resolveTransformSize(slot.transform, slot.dimension);
    placements.set(slotId, {
      slotId,
      dimension: slot.dimension,
      imageFileName: slot.image,
      assetKey: entry.key,
      url,
      x: slot.transform.x,
      y: slot.transform.y,
      width: size.width,
      height: size.height,
      rotation: slot.transform.rotation,
      transform: slot.transform,
      isLocked: slot.isLocked,
    });
  }

  return placements;
}

export const ASSET_PLACEMENTS: ReadonlyMap<string, AssetPlacement> = buildPlacementRegistry();

export function assetPlacement(slotId: string): AssetPlacement | undefined {
  return ASSET_PLACEMENTS.get(slotId);
}

export function requireAssetPlacement(slotId: string): AssetPlacement {
  const placement = assetPlacement(slotId);
  if (placement === undefined) throw new Error(`Required asset placement is missing: ${slotId}`);
  return placement;
}

export function applyAssetPlacement(target: PlacementTarget, placement: AssetPlacement): void {
  target.position.set(placement.x, placement.y);
  target.width = placement.width;
  target.height = placement.height;
  target.rotation = placement.rotation;
}
