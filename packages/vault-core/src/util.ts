export function newId(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

export function changedFields<T extends Record<string, unknown>>(before: T, after: T, keys: (keyof T)[]): string[] {
  const changed: string[] = [];
  for (const key of keys) {
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) changed.push(String(key));
  }
  return changed;
}

export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD");
}

export function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true;
  return normalizeSearch(haystack).includes(normalizeSearch(query));
}
