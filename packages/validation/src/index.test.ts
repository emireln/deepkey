import { describe, expect, it } from "vitest";
import { assertNoPathTraversal, formatHint, safeFilename, scorePassword } from "./index.js";

describe("validation", () => {
  it("scores passwords", () => {
    expect(scorePassword("short").score).toBeLessThan(2);
    expect(scorePassword("Correct-Horse-Battery-Staple-99").score).toBeGreaterThan(2);
  });

  it("hints known formats without rejecting unknown keys", () => {
    expect(formatHint("https://example.com")).toBe("url");
    expect(formatHint("550e8400-e29b-41d4-a716-446655440000")).toBe("uuid");
    expect(formatHint("sk-unknown-format-not-a-url")).toBeNull();
    expect(formatHint("-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----")).toBe("ssh");
  });

  it("sanitizes filenames", () => {
    expect(safeFilename("../etc/passwd")).toBe("file");
    expect(safeFilename("key.pem")).toBe("key.pem");
    expect(() => assertNoPathTraversal("../x")).toThrow();
  });
});
