import { Assets } from 'pixi.js';
import { buildAssetRegistry } from './assetRegistry';

const discoveredPngUrls = import.meta.glob<string>('../../../assets/**/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});

/**
 * Vite discovers files; the runtime registry derives every slot from the
 * filename. There is intentionally no hand-maintained asset manifest.
 */
export const runtimeAssetRegistry = buildAssetRegistry(discoveredPngUrls);

/** Preloads registry URLs once so Sprite.from only reads Pixi's texture cache. */
export async function preloadRuntimeAssets(): Promise<void> {
  const urls = [...runtimeAssetRegistry.values()].map((asset) => asset.url);
  if (urls.length === 0) return;
  await Assets.load(urls);
}
