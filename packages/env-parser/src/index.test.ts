import { describe, expect, it } from "vitest";
import { parseEnv, serializeEnv, serializeValue } from "./index.js";

describe("env parser", () => {
  it("parses basic assignments", () => {
    const result = parseEnv("FOO=bar\nBAZ=qux\n");
    expect(result.entries.map((e) => [e.key, e.value])).toEqual([
      ["FOO", "bar"],
      ["BAZ", "qux"],
    ]);
  });

  it("parses export prefix, comments, and blanks", () => {
    const result = parseEnv("# header\n\nexport TOKEN=abc\n");
    expect(result.comments[0]?.text).toBe("header");
    expect(result.entries[0]).toMatchObject({ key: "TOKEN", value: "abc" });
  });

  it("parses quoted values and escaped quotes", () => {
    const result = parseEnv(`NAME="hello \\"world\\""\nPATH='C:\\tmp'\n`);
    expect(result.entries[0]?.value).toBe('hello "world"');
    expect(result.entries[1]?.value).toBe("C:\\tmp");
  });

  it("parses multiline double-quoted values", () => {
    const result = parseEnv(`KEY="line1\nline2"\nNEXT=ok\n`);
    expect(result.entries[0]?.value).toBe("line1\nline2");
    expect(result.entries[1]?.value).toBe("ok");
  });

  it("detects duplicates and invalid keys", () => {
    const result = parseEnv("A=1\nA=2\n1BAD=x\nNOEQUALS\n");
    expect(result.duplicates).toEqual(["A"]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("roundtrips special characters", () => {
    const source = `DATABASE_URL="postgres://u:p@h/db?ssl=true"\nNOTE="a#b"\nEMPTY=\n`;
    const parsed = parseEnv(source);
    const serialized = serializeEnv(parsed.entries);
    const again = parseEnv(serialized);
    expect(again.entries.map((e) => [e.key, e.value])).toEqual(parsed.entries.map((e) => [e.key, e.value]));
  });

  it("quotes values that need it", () => {
    expect(serializeValue("hello world")).toBe('"hello world"');
    expect(serializeValue("plain")).toBe("plain");
  });

  it("keeps inline comments for unquoted values", () => {
    const result = parseEnv("FOO=bar # note\n");
    expect(result.entries[0]).toMatchObject({ key: "FOO", value: "bar", comment: "note" });
  });
});
