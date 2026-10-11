import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
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

const SETUP_TOKEN_FILE = "setup.token";

function setupTokenPath(): string {
  return path.join(dataDir(), SETUP_TOKEN_FILE);
}

/**
 * Until the first account exists, setup needs a token that only someone who can read the data folder has.
 * Without it, whoever reaches a new server first could claim it. The file goes away once setup succeeds.
 */
export function ensureSetupToken(): void {
  if (userCount() > 0) {
    removeSetupToken();
    return;
  }
  const file = setupTokenPath();
  if (fs.existsSync(file)) return;
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file, bytesToB64(randomBytes(24)), { mode: 0o600, flag: "wx" });
}

export function setupTokenMatches(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;
  let expected: string;
  try {
    expected = fs.readFileSync(setupTokenPath(), "utf8").trim();
  } catch {
    return false;
  }
  return expected.length > 0 && safeEqual(candidate, expected);
}

export function removeSetupToken(): void {
  fs.rmSync(setupTokenPath(), { force: true });
}

export function hashToken(token: string): string {
  return sha256Hex(`${SESSION_SECRET}:${token}`);
}

// Failed attempts live in SQLite, so a restart does not reset the limit.
export function rateLimited(key: string): boolean {
  const row = store.sqlite
    .prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND at > ?")
    .get(key, Date.now() - AUTH_WINDOW_MS) as { n: number };
  return row.n >= AUTH_MAX_ATTEMPTS;
}

export function recordAttempt(key: string, success: boolean): void {
  if (success) {
    store.sqlite.prepare("DELETE FROM auth_attempts WHERE key = ?").run(key);
    return;
  }
  const now = Date.now();
  store.sqlite.prepare("INSERT INTO auth_attempts (key, at, success) VALUES (?, ?, 0)").run(key, now);
  // Failures outside the window no longer count, so they are not kept.
  store.sqlite.prepare("DELETE FROM auth_attempts WHERE at <= ?").run(now - AUTH_WINDOW_MS);
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
  if (!safeEqual(hash, row.password_hash)) return null;
  return row.id;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = bytesToB64(randomBytes(32));
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  // Expired sessions are refused on use anyway. Remove them here so the table does not grow forever.
  store.sqlite.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
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

export function changeUserPassword(userId: string, current: string, next: string): boolean {
  const row = store.sqlite.prepare("SELECT password_hash, kdf FROM users WHERE id = ?").get(userId) as
    | { password_hash: string; kdf: string }
    | undefined;
  if (!row) return false;
  const kdf = JSON.parse(row.kdf) as KdfParams;
  const currentHash = bytesToB64(deriveKek(current, kdf));
  if (!safeEqual(currentHash, row.password_hash)) return false;
  const parsedNext = authPasswordSchema.parse(next);
  const nextKdf: KdfParams = {
    algorithm: "argon2id",
    version: 0x13,
    t: 3,
    m: 19456,
    p: 1,
    dkLen: 32,
    salt: bytesToB64(randomBytes(16)),
  };
  const nextHash = bytesToB64(deriveKek(parsedNext, nextKdf));
  store.sqlite.prepare("UPDATE users SET password_hash = ?, kdf = ? WHERE id = ?").run(nextHash, JSON.stringify(nextKdf), userId);
  return true;
}

export function destroyOtherSessions(userId: string, keepToken: string | undefined): void {
  if (!keepToken) {
    store.sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    return;
  }
  store.sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, hashToken(keepToken));
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
