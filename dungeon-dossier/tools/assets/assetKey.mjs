/**
 * The one filename -> asset key rule, shared by the importer, the catalog
 * builder, and the palette checker. `src/ui/core/assetRegistry.ts` implements
 * the same split for the browser; `tests/tools/import-nhn-assets.test.ts` pins
 * the two against each other so they cannot drift.
 *
 *   stem     = filename without the trailing ".png"
 *   category = first "_" token
 *   state    = last "_" token
 *   name     = everything between, rejoined with "_"
 *   key      = `${category}/${name}/${state}`
 *
 * The extension check is deliberately case-sensitive: a repository that accepts
 * both `.png` and `.PNG` produces two different keys for one logical asset on a
 * case-insensitive filesystem.
 */

export const REQUIRED_EXTENSION = ".png";

/** ASCII-only, lower case, no padding stripped. Applies to NHN deliverables. */
const NHN_SEGMENT_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export function hasRuntimeExtension(fileName) {
  return fileName.endsWith(REQUIRED_EXTENSION) && fileName.length > REQUIRED_EXTENSION.length;
}

export function assetFileStem(fileName) {
  if (!hasRuntimeExtension(fileName)) {
    throw new Error(`Asset must be a lower-case .png file: ${fileName}`);
  }
  return fileName.slice(0, -REQUIRED_EXTENSION.length);
}

export function assetKeyFromFileName(fileName) {
  const tokens = assetFileStem(fileName).split("_");
  if (tokens.length < 3) {
    throw new Error(`Asset name must follow category_name_state.png: ${fileName}`);
  }
  const category = tokens[0];
  const state = tokens.at(-1);
  const name = tokens.slice(1, -1).join("_");
  return `${category}/${name}/${state}`;
}

export function assetKeySegments(key) {
  const segments = key.split("/");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`Asset key must be category/name/state: ${key}`);
  }
  return { category: segments[0], name: segments[1], state: segments[2] };
}

/** Stricter rule for the NHN deliverables only; legacy keys contain Hangul. */
export function isNhnAssetKey(key) {
  try {
    const { category, name, state } = assetKeySegments(key);
    return [category, name, state].every((segment) => NHN_SEGMENT_PATTERN.test(segment));
  } catch {
    return false;
  }
}

/**
 * Runtime keys only promise three non-empty NFC segments: the legacy
 * placeholder set uses Hangul names such as `배경/심문실/시안`, and tightening
 * this to ASCII would drop them out of the registry.
 */
export function isRuntimeAssetKey(key) {
  if (typeof key !== "string" || key.normalize("NFC") !== key) return false;
  try {
    assetKeySegments(key);
    return true;
  } catch {
    return false;
  }
}
