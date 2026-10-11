import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The preload and the main process are not loaded here, because that needs Electron. These checks read
// their source instead, so a channel added in one place and forgotten in the other fails the build.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

function allowedInvokeChannels(preload: string): string[] {
  const block = /const ALLOWED = new Set\(\[([\s\S]*?)\]\);/.exec(preload)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

function handledChannels(main: string): string[] {
  return [...main.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((match) => match[1]!);
}

function sentEvents(main: string): string[] {
  return [...main.matchAll(/webContents\.send\("([^"]+)"/g)].map((match) => match[1]!);
}

describe("desktop IPC", () => {
  const preload = read("electron/preload.cjs");
  const main = read("electron/main.ts");

  it("allows exactly the channels the main process handles", () => {
    expect(allowedInvokeChannels(preload).length).toBeGreaterThan(30);
    expect(new Set(allowedInvokeChannels(preload))).toEqual(new Set(handledChannels(main)));
  });

  it("only listens for events the main process sends", () => {
    const listened = [...preload.matchAll(/channel !== "([^"]+)"/g)].map((match) => match[1]!);
    expect(sentEvents(main).length).toBeGreaterThan(0);
    for (const event of sentEvents(main)) {
      expect(listened, event).toContain(event);
    }
  });
});
