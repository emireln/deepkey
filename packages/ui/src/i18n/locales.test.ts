import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { ptBR } from "./pt-BR.js";
import { getLocale, setLocale, t } from "./index.js";

describe("locale tables", () => {
  it("has a non-empty translation for every English key", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(ptBR)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("returns the strings of the locale that is set", () => {
    setLocale("pt-BR");
    expect(t("save")).toBe(ptBR.save);
    setLocale("en");
    expect(t("save")).toBe(en.save);
    expect(getLocale()).toBe("en");
  });
});
