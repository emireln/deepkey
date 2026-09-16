import { en, type MessageKey, type Messages } from "./en.js";
import { ptBR } from "./pt-BR.js";
import type { Locale } from "@deepkey/types";

const tables: Record<Locale, Messages> = {
  en,
  "pt-BR": ptBR,
};

let locale: Locale = "en";

export function setLocale(next: Locale): void {
  locale = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "pt-BR" ? "pt-BR" : "en";
  }
}

export function getLocale(): Locale {
  return locale;
}

export function t(key: MessageKey): string {
  return tables[locale][key] ?? tables.en[key] ?? key;
}
