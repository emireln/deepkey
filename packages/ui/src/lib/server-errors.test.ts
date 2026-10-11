import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.js";
import { setLocale } from "../i18n/index.js";
import { serverErrorText } from "./server-errors.js";

describe("server error text", () => {
  it("shows the locale text for known codes", () => {
    setLocale("en");
    expect(serverErrorText(new Error("invalid_credentials"))).toBe(en.errInvalidCredentials);
    expect(serverErrorText(new Error("setup_token_invalid"))).toBe(en.errSetupToken);
    expect(serverErrorText(new Error("request_header_missing"))).toBe(en.errForbidden);
  });

  it("falls back to the generic text for anything else", () => {
    setLocale("en");
    expect(serverErrorText(new Error("Request failed."))).toBe(en.errorGeneric);
    expect(serverErrorText(new Error("constructor"))).toBe(en.errorGeneric);
    expect(serverErrorText("not an error object")).toBe(en.errorGeneric);
  });
});
