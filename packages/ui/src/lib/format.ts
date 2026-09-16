import type { ItemType } from "@deepkey/types";

export function formatDate(ts: number, locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

export function expiresLabel(ts: number, locale = "en"): { text: string; warn: boolean; expired: boolean } {
  const diff = ts - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: locale === "pt-BR" ? "Expirado" : "Expired", warn: true, expired: true };
  if (days === 0) return { text: locale === "pt-BR" ? "Expira hoje" : "Expires today", warn: true, expired: false };
  if (days === 1) return { text: locale === "pt-BR" ? "Expira em 1 dia" : "Expires in 1 day", warn: true, expired: false };
  return {
    text: locale === "pt-BR" ? `Expira em ${days} dias` : `Expires in ${days} days`,
    warn: days <= 7,
    expired: false,
  };
}

export function typeLabel(type: ItemType): string {
  const map: Record<ItemType, string> = {
    api_key: "API Key",
    token: "Token",
    credential: "Credential",
    env_var: "Environment Variable",
    database: "Database",
    ssh_key: "SSH Key",
    certificate: "Certificate",
    webhook: "Webhook",
    secure_note: "Secure Note",
    file: "File",
    custom: "Custom",
  };
  return map[type];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "DK";
}

export function mask(value: string): string {
  if (!value) return "";
  return "•".repeat(Math.min(24, Math.max(8, value.length)));
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime = "application/octet-stream"): void {
  const blob = new Blob([bytes.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bytesFromText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
