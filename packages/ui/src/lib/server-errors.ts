import type { MessageKey } from "../i18n/en.js";
import { t } from "../i18n/index.js";

// Codes the server sends in { error }. Anything else falls back to the generic message.
const KEYS = new Map<string, MessageKey>([
  ["invalid_credentials", "errInvalidCredentials"],
  ["too_many_attempts", "errTooManyAttempts"],
  ["setup_done", "errSetupDone"],
  ["setup_token_invalid", "errSetupToken"],
  ["account_invalid", "errAccountInvalid"],
  ["origin_forbidden", "errForbidden"],
  ["request_header_missing", "errForbidden"],
  ["payload_too_large", "errTooLarge"],
]);

export function serverErrorText(error: unknown): string {
  const key = error instanceof Error ? KEYS.get(error.message) : undefined;
  return key ? t(key) : t("errorGeneric");
}
