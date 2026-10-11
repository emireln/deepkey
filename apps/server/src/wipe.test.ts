import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sqliteVaultStore } from "@deepkey/database";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function bytesOnDisk(file: string): Buffer {
  const parts = [fs.readFileSync(file)];
  if (fs.existsSync(`${file}-wal`)) parts.push(fs.readFileSync(`${file}-wal`));
  return Buffer.concat(parts);
}

describe("wipe", () => {
  it("leaves no deleted ciphertext in the database file or the WAL", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepkey-wipe-"));
    dirs.push(dir);
    const file = path.join(dir, "deepkey.sqlite");
    const marker = `CIPHERTEXT-MARKER-${Date.now()}`;

    const store = sqliteVaultStore(file);
    await store.putRecord({
      id: "record-1",
      nonce: "nonce-0001",
      ciphertext: marker.repeat(400),
      aad: "deepkey:record:v1",
      cryptoVersion: 1,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    });
    expect(bytesOnDisk(file).includes(marker)).toBe(true);

    await store.wipe();
    store.sqlite.close();

    expect(bytesOnDisk(file).includes(marker)).toBe(false);
  });
});
