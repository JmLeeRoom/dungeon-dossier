function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }

  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

