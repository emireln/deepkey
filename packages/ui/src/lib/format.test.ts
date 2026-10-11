import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR.js";
import { en } from "../i18n/en.js";
import { setLocale } from "../i18n/index.js";
import { expiresLabel, formatDate, typeLabel } from "./format.js";

const DAY = 24 * 60 * 60 * 1000;

describe("formatting", () => {
  it("formats dates in the locale asked for", () => {
    const noon = new Date(2026, 9, 11, 12, 0).getTime();
    expect(formatDate(noon, "en")).toMatch(/Oct 11, 2026/);
    expect(formatDate(noon, "pt-BR")).toMatch(/11 de out\. de 2026/);
  });

  it("uses the active locale when none is passed", () => {
    const noon = new Date(2026, 9, 11, 12, 0).getTime();
    setLocale("pt-BR");
    expect(formatDate(noon)).toMatch(/11 de out\. de 2026/);
    setLocale("en");
    expect(formatDate(noon)).toMatch(/Oct 11, 2026/);
  });

  it("describes expiry in the active locale", () => {
    setLocale("en");
    expect(expiresLabel(Date.now() + 3 * DAY)).toMatchObject({ text: "Expires in 3 days", warn: true, expired: false });
    expect(expiresLabel(Date.now() - DAY).expired).toBe(true);
    expect(expiresLabel(Date.now() - DAY).text).toBe(en.expiredLabel);
    setLocale("pt-BR");
    expect(expiresLabel(Date.now() + 3 * DAY).text).toBe(ptBR.expiresInDays.replace("{n}", "3"));
    setLocale("en");
  });

  it("names item types in the active locale", () => {
    setLocale("pt-BR");
    expect(typeLabel("api_key")).toBe(ptBR.typeApiKey);
    expect(typeLabel("env_var")).toBe(ptBR.typeEnvVar);
    setLocale("en");
    expect(typeLabel("api_key")).toBe(en.typeApiKey);
  });
});
