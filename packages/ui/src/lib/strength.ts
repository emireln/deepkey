import type { PasswordHint, PasswordStrength } from "@deepkey/validation";
import type { MessageKey } from "../i18n/en.js";
import { t } from "../i18n/index.js";

const LABEL_KEYS: Record<PasswordStrength["label"], MessageKey> = {
  "very weak": "pwVeryWeak",
  weak: "pwWeak",
  fair: "pwFair",
  strong: "pwStrong",
  excellent: "pwExcellent",
};

const HINT_KEYS: Record<PasswordHint, MessageKey> = {
  length: "pwHintLength",
  lowercase: "pwHintLowercase",
  uppercase: "pwHintUppercase",
  number: "pwHintNumber",
  symbol: "pwHintSymbol",
  common: "pwHintCommon",
  name: "pwHintName",
};

export function strengthLabel(strength: PasswordStrength): string {
  return t(LABEL_KEYS[strength.label]);
}

export function strengthHint(hint: PasswordHint): string {
  return t(HINT_KEYS[hint]);
}
