export interface AssetDimension {
  readonly width: number;
  readonly height: number;
}

export const ASSET_DIMENSION_IDS = [
  'bg_interrogation',
  'desk_foreground',
  'suspect_base',
  'suspect_state_parts',
  'partner',
  'card_base',
  'card_illust',
  'evidence',
  'icon_composure',
  'icon_coercion',
] as const;

export type AssetDimensionId = (typeof ASSET_DIMENSION_IDS)[number];

/**
 * The single source of truth for authored PNG sizes. Every value is measured in
 * source pixels: the 1280x800 HD frame, not the 640x400 layout grid. Renderers,
 * the workbench, and the placeholder pipeline all read this table so a resize
 * happens in exactly one place.
 */
export const ASSET_DIMENSIONS: Readonly<Record<AssetDimensionId, AssetDimension>> = {
  bg_interrogation: { width: 1280, height: 800 },
  // 321 is odd on purpose: it cannot land on an integer height in the 640x400
  // grid, so `fg-desk` is the one slot that releases its aspect lock and states
  // an explicit 640x161 rect. See docs/design/event_system_custom_scale_deadscene_design.md §2.3.
  desk_foreground: { width: 1280, height: 321 },
  suspect_base: { width: 512, height: 512 },
  suspect_state_parts: { width: 512, height: 512 },
  partner: { width: 512, height: 512 },
  card_base: { width: 640, height: 725 },
  card_illust: { width: 256, height: 256 },
  evidence: { width: 128, height: 128 },
  icon_composure: { width: 32, height: 32 },
  icon_coercion: { width: 32, height: 32 },
};

const ASSET_DIMENSION_ID_SET: ReadonlySet<string> = new Set(ASSET_DIMENSION_IDS);

export function isAssetDimensionId(value: string): value is AssetDimensionId {
  return ASSET_DIMENSION_ID_SET.has(value);
}

export function assetDimension(id: AssetDimensionId): AssetDimension {
  return ASSET_DIMENSIONS[id];
}

export function assetAspectRatio(id: AssetDimensionId): number {
  const dimension = ASSET_DIMENSIONS[id];
  return dimension.width / dimension.height;
}

export function matchesAssetDimension(id: AssetDimensionId, size: AssetDimension): boolean {
  const dimension = ASSET_DIMENSIONS[id];
  return size.width === dimension.width && size.height === dimension.height;
}

/**
 * Display rectangles may be scaled down for the 640x400 layout grid, but a
 * non-matching aspect ratio would stretch authored pixel art, so it is an error
 * rather than a warning.
 */
export function matchesAssetAspectRatio(id: AssetDimensionId, size: AssetDimension): boolean {
  const dimension = ASSET_DIMENSIONS[id];
  return size.width * dimension.height === size.height * dimension.width;
}

export function assertAssetDimension(id: AssetDimensionId, size: AssetDimension): void {
  if (matchesAssetDimension(id, size)) return;
  const dimension = ASSET_DIMENSIONS[id];
  throw new Error(
    `Asset "${id}" must be ${dimension.width}x${dimension.height}px, received ${size.width}x${size.height}px.`,
  );
}
