/**
 * Shape declarations only, so the generated table can be typed without
 * importing the module that consumes it.
 */

/**
 * A runtime image identity, `category/name/state`, derived from the PNG
 * filename stem and nothing else. Directories organise delivery; they never
 * appear in a key.
 *
 * Transitional keys are only promised to be three non-empty NFC segments: the
 * generated placeholder set still uses Hangul names such as `배경/심문실/시안`.
 * The stricter ASCII rule applies to the NHN deliverables and is enforced by
 * the importer, not here.
 */
export type AssetKey = string;

export const ASSET_BUNDLE_IDS = ['core', 'interrogation', 'board', 'event', 'result'] as const;
export type AssetBundleId = (typeof ASSET_BUNDLE_IDS)[number];

/** `nhn-2026` is approved production art; `legacy-placeholder` is generated. */
export type AssetProvenance = 'nhn-2026' | 'legacy-placeholder';
export type AssetStatus = 'active' | 'legacy-fallback';

/**
 * Generated placeholders stay inside the 16-colour house style. Approved
 * production art is exempted by exact digest, never by path glob, so replacing
 * a file through any other route fails the palette gate instead of quietly
 * shipping unreviewed art.
 */
export type AssetPalettePolicy = 'strict16' | 'approved-production';

export interface RuntimeAssetCatalogEntry {
  readonly key: AssetKey;
  readonly fileName: `${string}.png`;
  readonly runtimePath: `${string}.png`;
  readonly width: number;
  readonly height: number;
  readonly bundles: readonly AssetBundleId[];
  readonly provenance: AssetProvenance;
  readonly status: AssetStatus;
  readonly palettePolicy: AssetPalettePolicy;
  readonly sha256: string;
  readonly sourceWorkbookRow?: number;
  readonly sourcePath?: string;
}
