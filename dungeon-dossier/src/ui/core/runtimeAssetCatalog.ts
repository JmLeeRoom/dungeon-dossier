import { RUNTIME_ASSET_CATALOG_DATA } from './generated/runtimeAssetCatalogData.js';
import {
  ASSET_BUNDLE_IDS,
  type AssetBundleId,
  type AssetKey,
  type AssetProvenance,
  type RuntimeAssetCatalogEntry,
} from './runtimeAssetCatalogTypes.js';

export * from './runtimeAssetCatalogTypes.js';

export const RUNTIME_ASSET_CATALOG: readonly RuntimeAssetCatalogEntry[] = RUNTIME_ASSET_CATALOG_DATA;

/** The transitional population: the generated set plus the NHN deliverables. */
export const EXPECTED_CATALOG_COUNTS = {
  total: 142,
  legacyPlaceholder: 55,
  nhn2026: 87,
} as const;

function indexBy(
  select: (entry: RuntimeAssetCatalogEntry) => string,
): ReadonlyMap<string, RuntimeAssetCatalogEntry> {
  const index = new Map<string, RuntimeAssetCatalogEntry>();
  for (const entry of RUNTIME_ASSET_CATALOG) {
    const field = select(entry);
    if (index.has(field)) {
      throw new Error(`Runtime asset catalog has a duplicate index value: ${field}`);
    }
    index.set(field, entry);
  }
  return index;
}

const BY_KEY = indexBy((entry) => entry.key);
/** The V3 manifest stores bare basenames; this is the bridge back to a key. */
const BY_FILE_NAME = indexBy((entry) => entry.fileName);
const BY_RUNTIME_PATH = indexBy((entry) => entry.runtimePath);

const BY_BUNDLE: ReadonlyMap<AssetBundleId, readonly AssetKey[]> = new Map(
  ASSET_BUNDLE_IDS.map((bundle) => [
    bundle,
    RUNTIME_ASSET_CATALOG.filter((entry) => entry.bundles.includes(bundle)).map((entry) => entry.key),
  ]),
);

export function catalogEntry(key: AssetKey): RuntimeAssetCatalogEntry | undefined {
  return BY_KEY.get(key);
}

export function catalogEntryByFileName(fileName: string): RuntimeAssetCatalogEntry | undefined {
  return BY_FILE_NAME.get(fileName);
}

export function catalogEntryByRuntimePath(runtimePath: string): RuntimeAssetCatalogEntry | undefined {
  return BY_RUNTIME_PATH.get(runtimePath);
}

export function catalogHasKey(key: AssetKey): boolean {
  return BY_KEY.has(key);
}

export function catalogKeys(): readonly AssetKey[] {
  return [...BY_KEY.keys()];
}

export function catalogKeysForBundle(bundle: AssetBundleId): readonly AssetKey[] {
  return BY_BUNDLE.get(bundle) ?? [];
}

export function catalogCountsByProvenance(): Readonly<Record<AssetProvenance, number>> {
  return {
    'nhn-2026': RUNTIME_ASSET_CATALOG.filter((entry) => entry.provenance === 'nhn-2026').length,
    'legacy-placeholder': RUNTIME_ASSET_CATALOG.filter(
      (entry) => entry.provenance === 'legacy-placeholder',
    ).length,
  };
}

/**
 * Structural self-check of the generated table. Every field it verifies is
 * produced by the builder, so a failure here means the checked-in file was
 * edited by hand or generated from a different asset tree.
 */
export function validateRuntimeAssetCatalog(): readonly string[] {
  const problems: string[] = [];
  const bundleIds = new Set<string>(ASSET_BUNDLE_IDS);

  for (const entry of RUNTIME_ASSET_CATALOG) {
    const segments = entry.key.split('/');
    if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
      problems.push(`${entry.key}: keys must be category/name/state`);
    }
    if (entry.key.normalize('NFC') !== entry.key) {
      problems.push(`${entry.key}: keys must be NFC-normalized`);
    }
    if (!entry.runtimePath.endsWith(`/${entry.fileName}`)) {
      problems.push(`${entry.runtimePath}: must end with its file name "${entry.fileName}"`);
    }
    if (!entry.runtimePath.startsWith('assets/')) {
      problems.push(`${entry.runtimePath}: runtime paths live under assets/`);
    }
    if (entry.width <= 0 || entry.height <= 0) {
      problems.push(`${entry.key}: dimensions must be positive`);
    }
    if (entry.bundles.length === 0) {
      problems.push(`${entry.key}: must belong to at least one bundle`);
    }
    for (const bundle of entry.bundles) {
      if (!bundleIds.has(bundle)) problems.push(`${entry.key}: unknown bundle "${bundle}"`);
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      problems.push(`${entry.key}: sha256 must be 64 lower-case hex characters`);
    }
    if ((entry.provenance === 'nhn-2026') !== (entry.palettePolicy === 'approved-production')) {
      problems.push(
        `${entry.key}: approved-production is reserved for nhn-2026 provenance and required by it`,
      );
    }
    if (entry.provenance === 'nhn-2026' && entry.sourcePath === undefined) {
      problems.push(`${entry.key}: NHN entries must record their source path`);
    }
    if (entry.sourcePath?.split('/').some((segment) => segment === 'ref' || segment === 'PSD') === true) {
      problems.push(`${entry.key}: reference and PSD sources are never runtime assets`);
    }
  }

  const counts = catalogCountsByProvenance();
  if (counts['nhn-2026'] !== EXPECTED_CATALOG_COUNTS.nhn2026) {
    problems.push(
      `expected ${EXPECTED_CATALOG_COUNTS.nhn2026} NHN entries, catalog has ${counts['nhn-2026']}`,
    );
  }
  if (counts['legacy-placeholder'] !== EXPECTED_CATALOG_COUNTS.legacyPlaceholder) {
    problems.push(
      `expected ${EXPECTED_CATALOG_COUNTS.legacyPlaceholder} legacy entries, catalog has ${counts['legacy-placeholder']}`,
    );
  }
  if (RUNTIME_ASSET_CATALOG.length !== EXPECTED_CATALOG_COUNTS.total) {
    problems.push(
      `expected ${EXPECTED_CATALOG_COUNTS.total} catalog entries, found ${RUNTIME_ASSET_CATALOG.length}`,
    );
  }

  return problems;
}
