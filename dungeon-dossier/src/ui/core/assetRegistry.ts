export interface AssetSlot {
  readonly category: string;
  readonly name: string;
  readonly state: string;
  readonly url: string;
}

export type AssetRegistry = ReadonlyMap<string, AssetSlot>;

/**
 * Case-sensitive on purpose. Accepting `.PNG` as well would give one logical
 * image two different keys on a case-insensitive filesystem and one key on a
 * case-sensitive CI runner, which is the kind of difference that only shows up
 * after a deploy. `tools/assets/assetKey.mjs` applies the identical rule to the
 * importer and the catalog builder.
 */
const ASSET_FILE_PATTERN = /([^/\\]+)\.png$/u;

export function parseAssetFilename(path: string, url: string): AssetSlot {
  const match = ASSET_FILE_PATTERN.exec(path);
  if (match?.[1] === undefined) {
    throw new Error(`Asset must be a lower-case .png file: ${path}`);
  }

  const parts = match[1].split('_');
  if (parts.length < 3) {
    throw new Error(`Asset name must follow category_name_state.png: ${path}`);
  }

  const category = parts[0] as string;
  const state = parts.at(-1) as string;
  const name = parts.slice(1, -1).join('_');
  return { category, name, state, url };
}

/**
 * Keys are NFC-normalized because the legacy set uses Hangul names, and macOS
 * hands out NFD filenames: without this, `배경/심문실/시안` written on one
 * machine would miss the identical key looked up on another.
 */
export function assetRegistryKeyOf(slot: Pick<AssetSlot, 'category' | 'name' | 'state'>): string {
  return `${slot.category}/${slot.name}/${slot.state}`.normalize('NFC');
}

export function buildAssetRegistry(entries: Readonly<Record<string, string>>): AssetRegistry {
  const registry = new Map<string, AssetSlot>();
  for (const path of Object.keys(entries).sort()) {
    const slot = parseAssetFilename(path, entries[path] as string);
    const key = assetRegistryKeyOf(slot);
    if (registry.has(key)) throw new Error(`Duplicate asset slot: ${key}`);
    registry.set(key, slot);
  }
  return registry;
}
