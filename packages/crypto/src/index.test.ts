import { describe, expect, it } from "vitest";
import { AAD_ATTACHMENT, AAD_RECORD, CRYPTO_FORMAT_LEGACY_VERSION, KDF_MIN } from "@deepkey/config";
import {
  createVaultHeader,
  decryptAttachment,
  decryptRecord,
  encryptAttachment,
  encryptBytes,
  encryptRecord,
  envelopeFromParts,
  utf8,
  rewrapDek,
  unlockDek,
  wrapDek,
  unwrapDek,
  deriveKek,
  generateDek,
  disposeBytes,
  bytesToB64,
  b64ToBytes,
} from "./index.js";
import type { KdfParams } from "@deepkey/types";

const fast = { kdf: { ...KDF_MIN, version: 0x13 } };

describe("crypto", () => {
  it("wraps and unwraps a DEK", () => {
    const password = "correct horse battery staple";
    const params: KdfParams = {
      algorithm: "argon2id",
      version: 0x13,
      t: 3,
      m: 19456,
      p: 1,
      dkLen: 32,
      salt: bytesToB64(crypto.getRandomValues(new Uint8Array(16))),
    };
    const dek = generateDek();
    const kek = deriveKek(password, params);
    const wrapped = wrapDek(dek, kek);
    const out = unwrapDek(wrapped, kek);
    expect(Array.from(out)).toEqual(Array.from(dek));
    disposeBytes(kek);
    disposeBytes(dek);
    disposeBytes(out);
  });

  it("rejects a wrong master password", async () => {
    const { header } = await createVaultHeader("right-password-long-enough", "Dev", fast);
    expect(() => unlockDek("wrong-password-long-enough", header)).toThrow(/Decryption failed|Invalid/);
  });

  it("encrypts and decrypts records", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const payload = { kind: "item", name: "OPENAI_API_KEY", value: "sk-test" };
    const env = encryptRecord(dek, payload, "row-1");
    const out = decryptRecord<typeof payload>(dek, env, "row-1");
    expect(out).toEqual(payload);
  });

  it("fails on tampered ciphertext", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const env = encryptRecord(dek, { a: 1 }, "row-1");
    const bytes = b64ToBytes(env.c);
    bytes[0] = (bytes[0]! + 1) % 256;
    const tampered = { ...env, c: bytesToB64(bytes) };
    expect(() => decryptRecord(dek, tampered, "row-1")).toThrow();
  });

  it("fails on modified nonce", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const env = encryptRecord(dek, { a: 1 }, "row-1");
    const nonce = b64ToBytes(env.n);
    nonce[3] = (nonce[3]! + 1) % 256;
    const tampered = { ...env, n: bytesToB64(nonce) };
    expect(() => decryptRecord(dek, tampered, "row-1")).toThrow();
  });

  it("binds records and files to their id", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const env = encryptRecord(dek, { a: 1 }, "row-1");
    expect(() => decryptRecord(dek, env, "row-2")).toThrow();
    const file = encryptAttachment(dek, new Uint8Array([1, 2, 3]), "file-1");
    expect(() => decryptAttachment(dek, file, "file-2")).toThrow();
  });

  it("still reads records and files written in the first format", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const record = encryptBytes(dek, utf8(JSON.stringify({ a: 1 })), AAD_RECORD, CRYPTO_FORMAT_LEGACY_VERSION);
    expect(decryptRecord(dek, record, "any-id")).toEqual({ a: 1 });
    const file = encryptBytes(dek, new Uint8Array([9, 8]), AAD_ATTACHMENT, CRYPTO_FORMAT_LEGACY_VERSION);
    expect(Array.from(decryptAttachment(dek, file, "any-id"))).toEqual([9, 8]);
  });

  it("rejects envelope versions it does not know", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const env = { ...encryptRecord(dek, { a: 1 }, "row-1"), v: 99 };
    expect(() => decryptRecord(dek, env, "row-1")).toThrow(/version/);
  });

  it("uses unique nonces", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const nonces = new Set<string>();
    for (let i = 0; i < 32; i += 1) {
      nonces.add(encryptRecord(dek, { i }, `row-${i}`).n);
    }
    expect(nonces.size).toBe(32);
  });

  it("encrypts attachments", async () => {
    const { dek } = await createVaultHeader("master-password-ok", "Dev", fast);
    const file = new TextEncoder().encode("-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----");
    const env = encryptAttachment(dek, file, "file-1");
    const out = decryptAttachment(dek, env, "file-1");
    expect(Array.from(out)).toEqual(Array.from(file));
  });

  it("rewraps DEK on master password change", async () => {
    const { header, dek } = await createVaultHeader("old-password-strong", "Dev", fast);
    const next = rewrapDek(dek, "old-password-strong", "new-password-strong", header);
    const unlocked = unlockDek("new-password-strong", next);
    expect(Array.from(unlocked)).toEqual(Array.from(dek));
    expect(() => unlockDek("old-password-strong", next)).toThrow();
  });

  it("rejects kdf params below the floor", () => {
    const params: KdfParams = {
      algorithm: "argon2id",
      version: 0x13,
      t: 1,
      m: 8,
      p: 1,
      dkLen: 32,
      salt: bytesToB64(crypto.getRandomValues(new Uint8Array(16))),
    };
    expect(() => deriveKek("password", params)).toThrow(/floor/);
  });

  it("rejects an argon2 version this build does not run", () => {
    const params: KdfParams = {
      algorithm: "argon2id",
      version: 0x10,
      t: 3,
      m: 19456,
      p: 1,
      dkLen: 32,
      salt: bytesToB64(crypto.getRandomValues(new Uint8Array(16))),
    };
    expect(() => deriveKek("password", params)).toThrow(/version/);
  });

  it("rejects kdf params above the ceiling before running argon2", () => {
    const params: KdfParams = {
      algorithm: "argon2id",
      version: 0x13,
      t: 3,
      m: 2 ** 31,
      p: 1,
      dkLen: 32,
      salt: bytesToB64(crypto.getRandomValues(new Uint8Array(16))),
    };
    expect(() => deriveKek("password", params)).toThrow(/ceiling/);
  });

  it("envelopeFromParts roundtrips", () => {
    const env = envelopeFromParts("YQ==", "Yg==");
    expect(env.alg).toBe("xchacha20poly1305");
    expect(env.n).toBe("YQ==");
  });
});
