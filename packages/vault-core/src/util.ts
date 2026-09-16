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

export function itemSecret(item: { fields: Record<string, string>; customFields: { secret?: boolean; value: string }[] }): string | null {
  if (item.fields.value) return item.fields.value;
  if (item.fields.password) return item.fields.password;
  if (item.fields.privateKey) return item.fields.privateKey;
  if (item.fields.certificate) return item.fields.certificate;
  const custom = item.customFields.find((field) => field.secret && field.value);
  return custom?.value ?? null;
}
