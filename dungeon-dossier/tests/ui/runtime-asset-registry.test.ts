import { Assets } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASSET_BUNDLE_IDS,
  RUNTIME_ASSET_CATALOG,
  catalogEntry,
  catalogKeysForBundle,
} from '../../src/ui/core/runtimeAssetCatalog';
import {
  BOOT_CRITICAL_BUNDLES,
  DEFERRED_BUNDLES,
  preloadAssetKeys,
  preloadRuntimeAssets,
  resetPreloadedAssets,
  runtimeAssetRegistry,
  runtimeAssetRegistryDiagnostics,
  runtimeAssetUrl,
  runtimeAssetUrlByFileName,
} from '../../src/ui/core/runtimeAssetRegistry';
import {
  FALLBACK_ASSET_KEY,
  MissingRequiredAssetError,
  createUiAssetPort,
} from '../../src/ui/core/uiAssetPort';

describe('runtime asset registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetPreloadedAssets();
  });

  it('agrees with the generated catalog on every file, both directions', () => {
    // Importing the module already throws on a mismatch; this states the
    // invariant so a failure names it instead of reading as an import error.
    expect(runtimeAssetRegistryDiagnostics()).toEqual([]);
    expect(runtimeAssetRegistry.size).toBe(RUNTIME_ASSET_CATALOG.length);
    for (const entry of RUNTIME_ASSET_CATALOG) {
      expect(runtimeAssetUrl(entry.key), entry.key).toBeDefined();
    }
    for (const key of runtimeAssetRegistry.keys()) {
      expect(catalogEntry(key), key).toBeDefined();
    }
  });

  it('bridges a Manifest V3 basename to exactly one URL', () => {
    expect(runtimeAssetUrlByFileName('ui_card_base.png')).toBe(runtimeAssetUrl('ui/card/base'));
    expect(runtimeAssetUrlByFileName('bg_interrogationroom_desk.png')).toBe(
      runtimeAssetUrl('bg/interrogationroom/desk'),
    );
    expect(runtimeAssetUrlByFileName('not_a_real_file.png')).toBeUndefined();
  });

  it('keeps every route bundle out of the boot-critical decode', () => {
    expect([...BOOT_CRITICAL_BUNDLES, ...DEFERRED_BUNDLES].sort()).toEqual(
      [...ASSET_BUNDLE_IDS].sort(),
    );
    expect(BOOT_CRITICAL_BUNDLES).toEqual(['core']);
    expect(DEFERRED_BUNDLES).toEqual(['interrogation', 'board', 'event', 'result']);

    const bootKeys = new Set(BOOT_CRITICAL_BUNDLES.flatMap((bundle) => catalogKeysForBundle(bundle)));
    expect(bootKeys.size).toBeLessThan(RUNTIME_ASSET_CATALOG.length);
    // Result plates in particular are only needed once an encounter ends.
    expect(bootKeys.has('ui/game/clear')).toBe(false);
    expect(bootKeys.has('ui/game/fail')).toBe(false);
  });

  it('preloads only core at boot and never starts a deferred background decode', async () => {
    const load = vi.spyOn(Assets, 'load').mockResolvedValue({});

    await preloadRuntimeAssets();

    const requested = load.mock.calls.flatMap(([urls]) =>
      Array.isArray(urls) ? urls.map(String) : [String(urls)],
    );
    expect(new Set(requested)).toEqual(
      new Set(catalogKeysForBundle('core').map((key) => runtimeAssetUrl(key))),
    );
    expect(requested).not.toContain(runtimeAssetUrl('ui/card/base'));
    expect(requested).not.toContain(runtimeAssetUrl('ui/game/clear'));
  });

  it('single-flights overlapping key requests per URL', async () => {
    const load = vi.spyOn(Assets, 'load').mockResolvedValue({});
    const shared = 'ui/tag/base';

    await Promise.all([
      preloadAssetKeys(['ui/card/base', shared]),
      preloadAssetKeys([shared, 'ui/card/illust00']),
    ]);

    const requested = load.mock.calls.flatMap(([urls]) =>
      Array.isArray(urls) ? urls.map(String) : [String(urls)],
    );
    expect(requested.filter((url) => url === runtimeAssetUrl(shared))).toHaveLength(1);

    await preloadAssetKeys(['ui/card/base', shared, 'ui/card/illust00']);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('UI asset port', () => {
  const port = createUiAssetPort({
    resolve: (key) => (key === 'ui/card/base' || key === FALLBACK_ASSET_KEY ? `/${key}` : undefined),
    warn: () => undefined,
  });

  it('resolves a required key or fails with the context that produced it', () => {
    expect(port.has('ui/card/base')).toBe(true);
    expect(port.resolveRequiredUrl('ui/card/base', { screen: 'interrogation' })).toBe(
      '/ui/card/base',
    );

    let thrown: unknown;
    try {
      port.resolveRequiredUrl('ui/card/illust09', {
        screen: 'interrogation',
        contentId: 'card_pressure',
        slotId: 'card.illustration',
        bundle: 'interrogation',
      });
    } catch (error) {
      thrown = error;
    }
    // A required miss is a flow error naming where it came from, not a silent
    // swap to the placeholder that hides wrong art in production.
    expect(thrown).toBeInstanceOf(MissingRequiredAssetError);
    expect((thrown as Error).message).toContain('screen=interrogation');
    expect((thrown as Error).message).toContain('content=card_pressure');
    expect((thrown as Error).message).toContain('slot=card.illustration');
    expect((thrown as Error).message).toContain('bundle=interrogation');
  });

  it('reports an optional miss as undefined and never as the placeholder', () => {
    expect(port.resolveOptionalUrl('ui/card/base')).toBe('/ui/card/base');
    expect(port.resolveOptionalUrl('bg/event/nope')).toBeUndefined();
  });

  it('keeps the transitional lookup falling back explicitly', () => {
    expect(port.resolveUrl('ui/card/base')).toBe('/ui/card/base');
    expect(port.resolveUrl('bg/event/nope')).toBe(`/${FALLBACK_ASSET_KEY}`);

    const withoutFallback = createUiAssetPort({ resolve: () => undefined, warn: () => undefined });
    expect(withoutFallback.resolveUrl('anything/at/all')).toBeUndefined();
  });

  it('preloads only the keys it is given', async () => {
    const requested: string[][] = [];
    const tracking = createUiAssetPort({
      resolve: (key) => `/${key}`,
      preload: async (keys) => {
        requested.push([...keys]);
      },
      preloadBundle: async (bundle) => {
        requested.push([`bundle:${bundle}`]);
      },
    });
    await tracking.preloadKeys(['ui/card/base', 'ui/tag/base']);
    await tracking.preloadBundle('event');
    await tracking.preloadBundle('event', ['bg/event/rest']);
    expect(requested).toEqual([
      ['ui/card/base', 'ui/tag/base'],
      ['bundle:event'],
      ['bg/event/rest'],
    ]);
  });
});
