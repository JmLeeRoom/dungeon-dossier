import type { AssetRegistry, AssetSlot } from './assetRegistry';

export interface AssetReference {
  readonly category: string;
  readonly name: string;
  readonly state: string;
}

export type MissingAssetWarning = (message: string) => void;

export function assetRegistryKey(reference: AssetReference): string {
  return `${reference.category}/${reference.name}/${reference.state}`;
}

/**
 * Resolves only exact registry matches. Missing art is a presentation concern:
 * callers supply the one fallback slot appropriate for their scene, while this
 * helper reports the missing key and keeps the runtime moving.
 */
export function resolveAsset(
  registry: AssetRegistry,
  reference: AssetReference | string,
  fallback: AssetSlot,
  warn: MissingAssetWarning = (message) => console.warn(message),
): AssetSlot {
  const key = typeof reference === 'string' ? reference : assetRegistryKey(reference);
  const exact = registry.get(key);

  if (exact !== undefined) {
    return exact;
  }

  warn(
    `Missing asset "${key}"; using fallback "${assetRegistryKey(fallback)}".`,
  );
  return fallback;
}
