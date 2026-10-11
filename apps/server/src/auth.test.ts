import { describe, expect, it } from "vitest";
import { AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS } from "@deepkey/config";
import { rateLimited, recordAttempt, store } from "./auth.js";

describe("login limiter", () => {
  it("counts failures per key and clears them on success", () => {
    const key = "unit:limiter-reset";
    for (let i = 0; i < AUTH_MAX_ATTEMPTS; i += 1) recordAttempt(key, false);
    expect(rateLimited(key)).toBe(true);
    recordAttempt(key, true);
    expect(rateLimited(key)).toBe(false);
  });

  it("ignores failures that are older than the window", () => {
    const key = "unit:limiter-window";
    const old = Date.now() - AUTH_WINDOW_MS - 60_000;
    for (let i = 0; i < AUTH_MAX_ATTEMPTS; i += 1) {
      store.sqlite.prepare("INSERT INTO auth_attempts (key, at, success) VALUES (?, ?, 0)").run(key, old);
    }
    expect(rateLimited(key)).toBe(false);
  });
});
