import type { ItemType } from "@deepkey/types";
import type { MessageKey } from "../i18n/en.js";
import { getLocale, t } from "../i18n/index.js";

export function formatDate(ts: number, locale = getLocale()): string {
  return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

export function expiresLabel(ts: number): { text: string; warn: boolean; expired: boolean } {
  const diff = ts - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: t("expiredLabel"), warn: true, expired: true };
  if (days === 0) return { text: t("expiresToday"), warn: true, expired: false };
  if (days === 1) return { text: t("expiresTomorrow"), warn: true, expired: false };
  return { text: t("expiresInDays").replace("{n}", String(days)), warn: days <= 7, expired: false };
}

const TYPE_KEYS: Record<ItemType, MessageKey> = {
  api_key: "typeApiKey",
  token: "typeToken",
  credential: "typeCredential",
  env_var: "typeEnvVar",
  database: "typeDatabase",
  ssh_key: "typeSshKey",
  certificate: "typeCertificate",
  webhook: "typeWebhook",
  secure_note: "typeSecureNote",
  file: "typeFile",
  custom: "typeCustom",
};

export function typeLabel(type: ItemType): string {
  return t(TYPE_KEYS[type]);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "DK";
}

export function mask(value: string): string {
  if (!value) return "";
  return "•".repeat(Math.min(24, Math.max(8, value.length)));
}

export function bytesFromText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
