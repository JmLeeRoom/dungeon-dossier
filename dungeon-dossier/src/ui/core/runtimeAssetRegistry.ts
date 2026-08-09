import { Assets } from 'pixi.js';

import {
  assetRegistryKeyOf,
  buildAssetRegistry,
  parseAssetFilename,
  type AssetRegistry,
} from './assetRegistry';
import {
  ASSET_BUNDLE_IDS,
  catalogEntry,
  catalogKeys,
  catalogKeysForBundle,
  RUNTIME_ASSET_CATALOG,
  validateRuntimeAssetCatalog,
  type AssetBundleId,
  type AssetKey,
} from './runtimeAssetCatalog';

const discoveredPngUrls = import.meta.glob<string>('../../../assets/**/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});

/**
 * Vite discovers the files; the filename derives the key. The generated catalog
 * is the second half of that contract: it records what *should* be discovered,
 * with the size and digest of each file. Checking the two against each other is
 * the whole point — a PNG that exists but is uncatalogued has no reviewed
 * identity, and a catalogued key with no URL is a screen that will render
 * nothing at runtime instead of failing here.
 */
export const runtimeAssetRegistry: AssetRegistry = buildAssetRegistry(discoveredPngUrls);

function toRuntimePath(globPath: string): string {
  const index = globPath.indexOf('assets/');
  return index < 0 ? globPath : globPath.slice(index);
}

/** Every discovered PNG, keyed the same way the registry keys it. */
const discoveredRuntimePaths: ReadonlyMap<AssetKey, string> = new Map(
  Object.keys(discoveredPngUrls).map((globPath) => {
    const runtimePath = toRuntimePath(globPath);
    return [assetRegistryKeyOf(parseAssetFilename(globPath, runtimePath)), runtimePath];
  }),
);

/**
 * Reports every way the discovered file set and the generated catalog can
 * disagree. Returned rather than logged so the contract test can assert on the
 * exact diagnosis, and so the message a developer sees names the fix.
 */
export function runtimeAssetRegistryDiagnostics(): readonly string[] {
  const problems = [...validateRuntimeAssetCatalog()];

  for (const key of catalogKeys()) {
    if (!runtimeAssetRegistry.has(key)) {
      problems.push(`catalog key "${key}" has no PNG under assets/; run "pnpm assets:import"`);
      continue;
    }
    const entry = catalogEntry(key);
    const discoveredPath = discoveredRuntimePaths.get(key);
    if (entry !== undefined && discoveredPath !== undefined && discoveredPath !== entry.runtimePath) {
      problems.push(
        `asset key "${key}" resolves to ${discoveredPath} but the catalog records ${entry.runtimePath}`,
      );
    }
  }

  for (const key of runtimeAssetRegistry.keys()) {
    if (catalogEntry(key) === undefined) {
      problems.push(
        `PNG "${discoveredRuntimePaths.get(key) ?? key}" is not in the runtime catalog; run "pnpm assets:catalog"`,
      );
    }
  }

  return problems;
}

const diagnostics = runtimeAssetRegistryDiagnostics();
if (diagnostics.length > 0) {
  throw new Error(
    `Runtime asset catalog and assets/ are out of sync (${diagnostics.length} problem(s)):\n- ${diagnostics.join('\n- ')}`,
  );
}

export function runtimeAssetUrl(key: AssetKey): string | undefined {
  return runtimeAssetRegistry.get(key)?.url;
}

/** Resolves a V3 manifest `image` basename to a runtime URL via the catalog. */
export function runtimeAssetUrlByFileName(fileName: string): string | undefined {
  const entry = RUNTIME_ASSET_CATALOG.find((candidate) => candidate.fileName === fileName);
  return entry === undefined ? undefined : runtimeAssetUrl(entry.key);
}

const decodedUrls = new Set<string>();
const inFlightByUrl = new Map<string, Promise<void>>();

/**
 * Decodes exactly the requested keys and remembers what it decoded, so a key
 * shared by several screens costs one upload. URL discovery stays eager for the
 * synchronous lookups screens rely on; only the decode is deferred.
 *
 * In-flight work is indexed per URL rather than by an encoded batch string.
 * Besides keeping this source a normal text file, that makes overlapping
 * requests (`[a,b]` followed by `[b,c]`) single-flight `b` correctly.
 */
export async function preloadAssetKeys(keys: readonly AssetKey[]): Promise<void> {
  const requestedUrls = [
    ...new Set(
      keys
        .map((key) => runtimeAssetUrl(key))
        .filter((url): url is string => url !== undefined && !decodedUrls.has(url)),
    ),
  ];
  if (requestedUrls.length === 0) return;

  const waiting = new Set<Promise<void>>();
  const pendingUrls: string[] = [];
  for (const url of requestedUrls) {
    const existing = inFlightByUrl.get(url);
    if (existing === undefined) pendingUrls.push(url);
    else waiting.add(existing);
  }

  if (pendingUrls.length > 0) {
    // Self-referential on purpose: the `finally` closure only runs after the
    // binding is initialised, and it must not evict an entry a later request
    // has already replaced.
    const pending: Promise<void> = Assets.load(pendingUrls)
      .then(() => {
        for (const url of pendingUrls) decodedUrls.add(url);
      })
      .finally(() => {
        for (const url of pendingUrls) {
          if (inFlightByUrl.get(url) === pending) inFlightByUrl.delete(url);
        }
      });
    for (const url of pendingUrls) inFlightByUrl.set(url, pending);
    waiting.add(pending);
  }

  await Promise.all(waiting);
}

export async function preloadAssetBundles(bundles: readonly AssetBundleId[]): Promise<void> {
  await preloadAssetKeys(bundles.flatMap((bundle) => catalogKeysForBundle(bundle)));
}

/**
 * Only the universal fallback is boot-critical. Board, interrogation, event and
 * result art are route data: each transition requests the exact keys it will
 * render. Automatically decoding deferred bundles here would eventually load
 * the entire catalog even when the player never visits those routes.
 */
export const BOOT_CRITICAL_BUNDLES: readonly AssetBundleId[] = ['core'];
export const DEFERRED_BUNDLES: readonly AssetBundleId[] = ASSET_BUNDLE_IDS.filter(
  (bundle) => !BOOT_CRITICAL_BUNDLES.includes(bundle),
);

export async function preloadRuntimeAssets(): Promise<void> {
  await preloadAssetBundles(BOOT_CRITICAL_BUNDLES);
}

/** Test seam: forget what has been decoded so a fresh Pixi cache is honoured. */
export function resetPreloadedAssets(): void {
  decodedUrls.clear();
  inFlightByUrl.clear();
}
