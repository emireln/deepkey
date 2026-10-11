import { describe, expect, it } from "vitest";
import type { PasswordHint, PasswordStrength } from "@deepkey/validation";
import { en } from "../i18n/en.js";
import { ptBR } from "../i18n/pt-BR.js";
import { setLocale } from "../i18n/index.js";
import { strengthHint, strengthLabel } from "./strength.js";

const HINTS: PasswordHint[] = ["length", "lowercase", "uppercase", "number", "symbol", "common", "name", "variety"];

describe("password strength text", () => {
  it("translates every strength label", () => {
    setLocale("pt-BR");
    expect(strengthLabel({ score: 0, label: "very weak", hints: [] } as PasswordStrength)).toBe(ptBR.pwVeryWeak);
    expect(strengthLabel({ score: 4, label: "excellent", hints: [] } as PasswordStrength)).toBe(ptBR.pwExcellent);
    setLocale("en");
    expect(strengthLabel({ score: 2, label: "fair", hints: [] } as PasswordStrength)).toBe(en.pwFair);
  });

  it("gives every hint code a text in both locales, and the two texts differ", () => {
    for (const hint of HINTS) {
      setLocale("en");
      const english = strengthHint(hint);
      setLocale("pt-BR");
      const portuguese = strengthHint(hint);
      expect(english, hint).not.toBe("");
      expect(portuguese, hint).not.toBe("");
      expect(portuguese, hint).not.toBe(english);
    }
    setLocale("en");
  });
});
