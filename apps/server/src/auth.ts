import fs from "node:fs";
import path from "node:path";
import { AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS, SESSION_MAX_AGE_MS } from "@deepkey/config";
import { deriveKek, randomBytes, sha256Hex, bytesToB64, b64ToBytes } from "@deepkey/crypto";
import { sqliteVaultStore } from "@deepkey/database";
import { authPasswordSchema, usernameSchema } from "@deepkey/validation";
import { logError, logInfo } from "@deepkey/config";
import type { KdfParams } from "@deepkey/types";

export function dataDir(): string {
  return process.env.DEEPKEY_DATA_DIR || path.join(process.cwd(), "data");
}

export function dbPath(): string {
  return path.join(dataDir(), "deepkey.sqlite");
}

export const store = sqliteVaultStore(dbPath());

function sessionSecret(): string {
  const file = path.join(dataDir(), "session.key");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file, bytesToB64(randomBytes(32)), { mode: 0o600 });
  }
  return fs.readFileSync(file, "utf8").trim();
}

export const SESSION_SECRET = sessionSecret();

export function hashToken(token: string): string {
  return sha256Hex(`${SESSION_SECRET}:${token}`);
}

const attempts = new Map<string, number[]>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < AUTH_WINDOW_MS);
  attempts.set(key, list);
  return list.length >= AUTH_MAX_ATTEMPTS;
}

export function recordAttempt(key: string, success: boolean): void {
  const now = Date.now();
  if (!success) {
    const list = attempts.get(key) ?? [];
    list.push(now);
    attempts.set(key, list);
  } else {
    attempts.delete(key);
  }
  store.sqlite.prepare("INSERT INTO auth_attempts (key, at, success) VALUES (?, ?, ?)").run(key, now, success ? 1 : 0);
}

export function userCount(): number {
  const row = store.sqlite.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
  return row.n;
}

export function createUser(username: string, password: string): void {
  const parsedUser = usernameSchema.parse(username);
  const parsedPass = authPasswordSchema.parse(password);
  const kdf: KdfParams = {
    algorithm: "argon2id",
    version: 0x13,
    t: 3,
    m: 19456,
    p: 1,
    dkLen: 32,
    salt: bytesToB64(randomBytes(16)),
  };
  const hash = bytesToB64(deriveKek(parsedPass, kdf));
  store.sqlite
    .prepare("INSERT INTO users (id, username, password_hash, kdf, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), parsedUser, hash, JSON.stringify(kdf), Date.now());
}

export function verifyUser(username: string, password: string): string | null {
  const row = store.sqlite.prepare("SELECT id, password_hash, kdf FROM users WHERE username = ?").get(username) as
    | { id: string; password_hash: string; kdf: string }
    | undefined;
  if (!row) {
    deriveKek(password || "placeholder-password-xx", {
      algorithm: "argon2id",
      version: 0x13,
      t: 3,
      m: 19456,
      p: 1,
      dkLen: 32,
      salt: bytesToB64(randomBytes(16)),
    });
    return null;
  }
  const kdf = JSON.parse(row.kdf) as KdfParams;
  const hash = bytesToB64(deriveKek(password, kdf));
  if (hash !== row.password_hash) return null;
  return row.id;
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = bytesToB64(randomBytes(32));
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  store.sqlite
    .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), userId, hashToken(token), expiresAt, Date.now());
  return { token, expiresAt };
}

export function sessionUser(token: string | undefined): { id: string; username: string } | null {
  if (!token) return null;
  const row = store.sqlite
    .prepare(
      `SELECT users.id as id, users.username as username, sessions.expires_at as expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
    )
    .get(hashToken(token)) as { id: string; username: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username };
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  store.sqlite.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "Strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  };
}

export { logError, logInfo, path };
