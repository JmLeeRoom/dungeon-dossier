export type StringsTable = Readonly<Record<string, string>>;

let activeStrings: StringsTable = {};

/** Installs the loaded locale table. Bootstrap calls this once before mounting. */
export function installStrings(strings: StringsTable): void {
  activeStrings = strings;
}

/** Resets to an empty table; test isolation only. */
export function clearStrings(): void {
  activeStrings = {};
}

/**
 * Resolves a content string key: table hit first, then the caller fallback,
 * then the key itself so a missing entry stays visible instead of blank.
 */
export function t(key: string | undefined, fallback?: string): string {
  if (key === undefined || key === '') return fallback ?? '';
  return activeStrings[key] ?? fallback ?? key;
}

export function hasString(key: string): boolean {
  return activeStrings[key] !== undefined;
}
