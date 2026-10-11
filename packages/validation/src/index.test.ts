import { describe, expect, it } from "vitest";
import { assertNoPathTraversal, formatHint, opaqueIdSchema, parseOpaqueId, safeFilename, scorePassword } from "./index.js";

describe("validation", () => {
  it("scores passwords", () => {
    expect(scorePassword("short").score).toBeLessThan(2);
    expect(scorePassword("Correct-Horse-Battery-Staple-99").score).toBeGreaterThan(2);
  });

  it("reports password hints as codes the UI can translate", () => {
    expect(scorePassword("short").hints).toEqual(expect.arrayContaining(["length", "uppercase", "number", "symbol"]));
    expect(scorePassword("short").hints).not.toContain("lowercase");
    expect(scorePassword("Correct-Horse-Battery-Staple-99").hints).toEqual([]);
    expect(scorePassword("Maria-Vault-2026-Strong", ["Maria"]).hints).toContain("name");
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

  it("accepts vault ids and rejects traversal-looking keys", () => {
    expect(opaqueIdSchema.parse("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(opaqueIdSchema.parse("settings")).toBe("settings");
    expect(() => parseOpaqueId("../secret")).toThrow("Invalid id.");
    expect(() => parseOpaqueId("..")).toThrow("Invalid id.");
    expect(() => parseOpaqueId("a".repeat(81))).toThrow("Invalid id.");
  });
});
