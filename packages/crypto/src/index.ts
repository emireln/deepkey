import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes, bytesToHex, randomBytes as nobleRandom } from "@noble/hashes/utils.js";
import { AAD_ATTACHMENT, AAD_DEK, AAD_RECORD, CRYPTO_FORMAT_VERSION, KDF_FLOOR, KDF_MAX, KDF_MIN } from "@deepkey/config";
import type { CryptoEnvelope, KdfParams, VaultHeader } from "@deepkey/types";

const NONCE_LEN = 24;
const KEY_LEN = 32;
const SALT_LEN = 16;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export function randomBytes(length: number): Uint8Array {
  return nobleRandom(length);
}

export function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function utf8(text: string): Uint8Array {
  return utf8ToBytes(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function disposeBytes(bytes: Uint8Array | null | undefined): void {
  if (!bytes) return;
  bytes.fill(0);
}

export function sha256Hex(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? utf8(data) : data;
  return bytesToHex(sha256(bytes));
}

export function generateDek(): Uint8Array {
  return randomBytes(KEY_LEN);
}

function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): CryptoEnvelope {
  if (key.length !== KEY_LEN) {
    throw new CryptoError("Invalid key length.");
  }
  const nonce = randomBytes(NONCE_LEN);
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return {
    v: CRYPTO_FORMAT_VERSION,
    alg: "xchacha20poly1305",
    n: bytesToB64(nonce),
    c: bytesToB64(ciphertext),
  };
}

function aeadDecrypt(key: Uint8Array, envelope: CryptoEnvelope, aad: Uint8Array): Uint8Array {
  if (envelope.alg !== "xchacha20poly1305") {
    throw new CryptoError("Unsupported cipher.");
  }
  if (envelope.v !== CRYPTO_FORMAT_VERSION) {
    throw new CryptoError("Unsupported crypto format version.");
  }
  try {
    const nonce = b64ToBytes(envelope.n);
    if (nonce.length !== NONCE_LEN) {
      throw new CryptoError("Invalid nonce length.");
    }
    const ciphertext = b64ToBytes(envelope.c);
    const cipher = xchacha20poly1305(key, nonce, aad);
    return cipher.decrypt(ciphertext);
  } catch {
    throw new CryptoError("Decryption failed.");
  }
}

export function encryptBytes(key: Uint8Array, plaintext: Uint8Array, aad: string): CryptoEnvelope {
  return aeadEncrypt(key, plaintext, utf8(aad));
}

export function decryptBytes(key: Uint8Array, envelope: CryptoEnvelope, aad: string): Uint8Array {
  return aeadDecrypt(key, envelope, utf8(aad));
}

export function encryptJson<T>(key: Uint8Array, value: T, aad = AAD_RECORD): CryptoEnvelope {
  return encryptBytes(key, utf8(JSON.stringify(value)), aad);
}

export function decryptJson<T>(key: Uint8Array, envelope: CryptoEnvelope, aad = AAD_RECORD): T {
  const bytes = decryptBytes(key, envelope, aad);
  try {
    return JSON.parse(fromUtf8(bytes)) as T;
  } finally {
    disposeBytes(bytes);
  }
}

export function wrapDek(dek: Uint8Array, kek: Uint8Array): CryptoEnvelope {
  return encryptBytes(kek, dek, AAD_DEK);
}

export function unwrapDek(wrapped: CryptoEnvelope, kek: Uint8Array): Uint8Array {
  const dek = decryptBytes(kek, wrapped, AAD_DEK);
  if (dek.length !== KEY_LEN) {
    disposeBytes(dek);
    throw new CryptoError("Invalid DEK.");
  }
  return dek;
}

export function encryptRecord(dek: Uint8Array, payload: unknown): CryptoEnvelope {
  return encryptJson(dek, payload, AAD_RECORD);
}

export function decryptRecord<T>(dek: Uint8Array, envelope: CryptoEnvelope): T {
  return decryptJson<T>(dek, envelope, AAD_RECORD);
}

export function encryptAttachment(dek: Uint8Array, bytes: Uint8Array): CryptoEnvelope {
  return encryptBytes(dek, bytes, AAD_ATTACHMENT);
}

export function decryptAttachment(dek: Uint8Array, envelope: CryptoEnvelope): Uint8Array {
  return decryptBytes(dek, envelope, AAD_ATTACHMENT);
}

export function deriveKek(password: string, params: KdfParams): Uint8Array {
  if (params.algorithm !== "argon2id") {
    throw new CryptoError("Unsupported KDF.");
  }
  if (params.m < KDF_MIN.m || params.t < KDF_MIN.t || params.p < 1 || params.dkLen !== 32) {
    throw new CryptoError("KDF parameters below the secure floor.");
  }
  const salt = b64ToBytes(params.salt);
  if (salt.length < 16) {
    throw new CryptoError("KDF salt too short.");
  }
  const passwordBytes = utf8(password);
  try {
    return argon2id(passwordBytes, salt, {
      t: params.t,
      m: params.m,
      p: params.p,
      dkLen: params.dkLen,
      version: 0x13,
    });
  } finally {
    disposeBytes(passwordBytes);
  }
}

export async function calibrateKdf(targetMs = 450): Promise<Omit<KdfParams, "salt">> {
  const password = "deepkey-calibrate";
  const salt = randomBytes(SALT_LEN);
  let t = KDF_FLOOR.t;
  let m = KDF_FLOOR.m;
  let p = KDF_FLOOR.p;

  const measure = (opts: { t: number; m: number; p: number }): number => {
    const start = performance.now();
    argon2id(utf8(password), salt, { t: opts.t, m: opts.m, p: opts.p, dkLen: 32, version: 0x13 });
    return performance.now() - start;
  };

  let elapsed = measure({ t, m, p });
  while (elapsed > 2200 && m > KDF_MIN.m) {
    m = Math.max(KDF_MIN.m, Math.floor(m / 2));
    elapsed = measure({ t, m, p });
  }
  while (elapsed < targetMs && (m < KDF_MAX.m || t < KDF_MAX.t)) {
    if (m < KDF_MAX.m) {
      m = Math.min(KDF_MAX.m, m * 2);
    } else if (t < KDF_MAX.t) {
      t += 1;
    } else {
      break;
    }
    elapsed = measure({ t, m, p });
    if (elapsed > targetMs * 1.6) break;
  }

  return {
    algorithm: "argon2id",
    version: 0x13,
    t,
    m,
    p,
    dkLen: 32,
  };
}

export function createKdfParams(base: Omit<KdfParams, "salt">): KdfParams {
  return {
    ...base,
    salt: bytesToB64(randomBytes(SALT_LEN)),
  };
}

export async function createVaultHeader(
  masterPassword: string,
  displayName: string,
  options?: { kdf?: Omit<KdfParams, "salt"> },
): Promise<{
  header: VaultHeader;
  dek: Uint8Array;
}> {
  if (!masterPassword) {
    throw new CryptoError("Master password is required.");
  }
  const calibrated = options?.kdf ?? (await calibrateKdf());
  const kdf = createKdfParams(calibrated);
  const dek = generateDek();
  const kek = deriveKek(masterPassword, kdf);
  try {
    const wrappedDek = wrapDek(dek, kek);
    const header: VaultHeader = {
      formatVersion: 1,
      cryptoVersion: CRYPTO_FORMAT_VERSION,
      createdAt: Date.now(),
      kdf,
      wrappedDek,
      displayName,
    };
    return { header, dek };
  } finally {
    disposeBytes(kek);
  }
}

export function unlockDek(masterPassword: string, header: VaultHeader): Uint8Array {
  const kek = deriveKek(masterPassword, header.kdf);
  try {
    return unwrapDek(header.wrappedDek, kek);
  } finally {
    disposeBytes(kek);
  }
}

export function rewrapDek(
  dek: Uint8Array,
  currentPassword: string,
  nextPassword: string,
  header: VaultHeader,
): VaultHeader {
  const currentKek = deriveKek(currentPassword, header.kdf);
  try {
    const check = unwrapDek(header.wrappedDek, currentKek);
    const same = check.length === dek.length && check.every((b, i) => b === dek[i]);
    disposeBytes(check);
    if (!same) {
      throw new CryptoError("Current master password is incorrect.");
    }
  } finally {
    disposeBytes(currentKek);
  }

  const nextKdf = createKdfParams({
    algorithm: "argon2id",
    version: header.kdf.version,
    t: header.kdf.t,
    m: header.kdf.m,
    p: header.kdf.p,
    dkLen: header.kdf.dkLen,
  });
  const nextKek = deriveKek(nextPassword, nextKdf);
  try {
    return {
      ...header,
      kdf: nextKdf,
      wrappedDek: wrapDek(dek, nextKek),
    };
  } finally {
    disposeBytes(nextKek);
  }
}

export function envelopeFromParts(nonceB64: string, ciphertextB64: string, version = CRYPTO_FORMAT_VERSION): CryptoEnvelope {
  return {
    v: version,
    alg: "xchacha20poly1305",
    n: nonceB64,
    c: ciphertextB64,
  };
}

export { AAD_ATTACHMENT, AAD_DEK, AAD_RECORD };
