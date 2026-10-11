import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.js";
import { setLocale } from "../i18n/index.js";
import { envErrorText } from "./env-errors.js";

describe(".env error text", () => {
  it("names the key in an invalid-key error", () => {
    setLocale("en");
    expect(envErrorText({ line: 2, code: "invalid-key", key: "1BAD" })).toBe(en.envErrInvalidKey.replace("{key}", "1BAD"));
    expect(envErrorText({ line: 2, code: "invalid-key", key: "1BAD" })).toContain('"1BAD"');
  });

  it("gives each other code its own text", () => {
    setLocale("en");
    expect(envErrorText({ line: 1, code: "missing-assignment" })).toBe(en.envErrMissing);
    expect(envErrorText({ line: 1, code: "unterminated-escape" })).toBe(en.envErrEscape);
    expect(envErrorText({ line: 1, code: "unterminated-quote" })).toBe(en.envErrQuote);
  });
});
