import type { EnvParseError } from "@deepkey/types";
import type { MessageKey } from "../i18n/en.js";
import { t } from "../i18n/index.js";

const KEYS: Record<EnvParseError["code"], MessageKey> = {
  "missing-assignment": "envErrMissing",
  "invalid-key": "envErrInvalidKey",
  "unterminated-escape": "envErrEscape",
  "unterminated-quote": "envErrQuote",
};

export function envErrorText(error: EnvParseError): string {
  const text = t(KEYS[error.code]);
  return error.code === "invalid-key" ? text.replace("{key}", error.key ?? "") : text;
}
