import { catalogEntry, type AssetBundleId, type AssetKey } from './runtimeAssetCatalog';
import {
  preloadAssetBundles,
  preloadAssetKeys,
  runtimeAssetUrl,
  runtimeAssetUrlByFileName,
} from './runtimeAssetRegistry';

/**
 * Everything a screen is allowed to know about images: keys in, URLs out. No
 * screen learns a directory, a file name, or a bundle layout.
 */
export interface AssetResolveContext {
  readonly screen: string;
  readonly contentId?: string;
  readonly slotId?: string;
  readonly bundle?: AssetBundleId;
}

export interface UiAssetPort {
  has(key: AssetKey): boolean;
  /**
   * Art the screen cannot render without. A miss is a flow error naming the
   * screen, the content, the slot and the expected key — not a silent swap to
   * the placeholder, which is how wrong art reaches production unnoticed.
   */
  resolveRequiredUrl(key: AssetKey, context: AssetResolveContext): string;
  /** Decoration. A miss is `undefined` and the caller draws nothing. */
  resolveOptionalUrl(key: AssetKey): string | undefined;
  /**
   * The transitional lookup the existing screens take. It keeps the explicit
   * placeholder fallback so partially-bound screens still render while the
   * legacy art is being retired.
   */
  resolveUrl(key: AssetKey): string | undefined;
  /** Bridges a Manifest V3 `image` basename to a URL through the catalog. */
  resolveUrlByFileName(fileName: string): string | undefined;
  preloadKeys(keys: readonly AssetKey[]): Promise<void>;
  preloadBundle(bundle: AssetBundleId, keys?: readonly AssetKey[]): Promise<void>;
}

export const FALLBACK_ASSET_KEY = 'placeholder/missing/fallback';

export class MissingRequiredAssetError extends Error {
  readonly assetKey: AssetKey;
  readonly context: AssetResolveContext;

  constructor(key: AssetKey, context: AssetResolveContext) {
    const detail = [
      `screen=${context.screen}`,
      context.contentId === undefined ? undefined : `content=${context.contentId}`,
      context.slotId === undefined ? undefined : `slot=${context.slotId}`,
      context.bundle === undefined ? undefined : `bundle=${context.bundle}`,
      catalogEntry(key) === undefined ? 'catalog=absent' : 'catalog=present,url=absent',
    ]
      .filter((part) => part !== undefined)
      .join(' ');
    super(`Required asset "${key}" could not be resolved (${detail}).`);
    this.name = 'MissingRequiredAssetError';
    this.assetKey = key;
    this.context = context;
  }
}

export interface CreateUiAssetPortOptions {
  /** Overridable so tests and the workbench can drive the port off a fixture. */
  readonly resolve?: (key: AssetKey) => string | undefined;
  readonly resolveByFileName?: (fileName: string) => string | undefined;
  readonly preload?: (keys: readonly AssetKey[]) => Promise<void>;
  readonly preloadBundle?: (bundle: AssetBundleId) => Promise<void>;
  readonly warn?: (message: string) => void;
}

export function createUiAssetPort(options: CreateUiAssetPortOptions = {}): UiAssetPort {
  const resolve = options.resolve ?? runtimeAssetUrl;
  const resolveByFileName = options.resolveByFileName ?? runtimeAssetUrlByFileName;
  const preload = options.preload ?? preloadAssetKeys;
  const preloadBundle = options.preloadBundle ?? ((bundle) => preloadAssetBundles([bundle]));
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const fallbackUrl = resolve(FALLBACK_ASSET_KEY);

  return {
    has(key) {
      return resolve(key) !== undefined;
    },
    resolveRequiredUrl(key, context) {
      const url = resolve(key);
      if (url === undefined) throw new MissingRequiredAssetError(key, context);
      return url;
    },
    resolveOptionalUrl(key) {
      return resolve(key);
    },
    resolveUrl(key) {
      const exact = resolve(key);
      if (exact !== undefined) return exact;
      if (fallbackUrl === undefined) {
        warn(`Missing asset "${key}"; no fallback is installed.`);
        return undefined;
      }
      warn(`Missing asset "${key}"; using fallback "${FALLBACK_ASSET_KEY}".`);
      return fallbackUrl;
    },
    resolveUrlByFileName(fileName) {
      return resolveByFileName(fileName);
    },
    async preloadKeys(keys) {
      await preload(keys);
    },
    async preloadBundle(bundle, keys) {
      if (keys === undefined) {
        await preloadBundle(bundle);
        return;
      }
      await preload(keys);
    },
  };
}
