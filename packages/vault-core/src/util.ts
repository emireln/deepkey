/**
 * RFC 4122 version 4 id from getRandomValues. crypto.randomUUID() only exists in secure contexts, so a
 * self-hosted instance opened over plain HTTP on a LAN address could not create anything.
 */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newId(): string {
  return randomUuid();
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
  // NFKD splits "é" into "e" plus a combining accent. Drop the accents so "naive" finds "naïve".
  return value.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
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
