export interface AssetSlot {
  readonly category: string;
  readonly name: string;
  readonly state: string;
  readonly url: string;
}

export type AssetRegistry = ReadonlyMap<string, AssetSlot>;

const ASSET_FILE_PATTERN = /([^/\\]+)\.png$/iu;

export function parseAssetFilename(path: string, url: string): AssetSlot {
  const match = ASSET_FILE_PATTERN.exec(path);
  if (match?.[1] === undefined) {
    throw new Error(`Asset must be a PNG: ${path}`);
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

export function buildAssetRegistry(entries: Readonly<Record<string, string>>): AssetRegistry {
  const registry = new Map<string, AssetSlot>();
  for (const path of Object.keys(entries).sort()) {
    const slot = parseAssetFilename(path, entries[path] as string);
    const key = `${slot.category}/${slot.name}/${slot.state}`;
    if (registry.has(key)) throw new Error(`Duplicate asset slot: ${key}`);
    registry.set(key, slot);
  }
  return registry;
}

