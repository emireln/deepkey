export const APP_NAME = "DeepKey";
export const APP_ID = "deepkey";
export const APP_VERSION = "1.0.4";
export const SOURCE_URL = "https://github.com/emireln/deepkey";
export const SUPPORT_URL = "https://buymeacoffee.com/emireln";

export const VAULT_FORMAT_VERSION = 1;
export const CRYPTO_FORMAT_VERSION = 1;
export const DATABASE_SCHEMA_VERSION = 1;
export const BACKUP_FORMAT_VERSION = 1;

export const MAGIC_BACKUP = "DEEPKEYVAULT";
export const AAD_DEK = "deepkey:dek:v1";
export const AAD_RECORD = "deepkey:record:v1";
export const AAD_ATTACHMENT = "deepkey:attachment:v1";

export const DEFAULT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const DEFAULT_HISTORY_LIMIT = 25;
export const DEFAULT_REVEAL_MS = 15_000;

export const KDF_FLOOR = {
  algorithm: "argon2id" as const,
  t: 3,
  m: 65_536,
  p: 1,
  dkLen: 32,
};

export const KDF_MIN = {
  algorithm: "argon2id" as const,
  t: 3,
  m: 19_456,
  p: 1,
  dkLen: 32,
};

export const KDF_MAX = {
  t: 6,
  m: 262_144,
  p: 4,
  dkLen: 32,
};

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_MAX_ATTEMPTS = 5;

export const ITEM_TYPES = [
  "api_key",
  "token",
  "credential",
  "env_var",
  "database",
  "ssh_key",
  "certificate",
  "webhook",
  "secure_note",
  "file",
  "custom",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const SECRET_TEMPLATES = [
  "api_key",
  "token",
  "credential",
  "database",
  "connection_string",
  "webhook",
  "ssh_key",
  "certificate",
  "custom",
] as const;

export const CLIPBOARD_TIMEOUTS = [
  { id: "never", ms: 0 },
  { id: "15s", ms: 15_000 },
  { id: "30s", ms: 30_000 },
  { id: "60s", ms: 60_000 },
  { id: "2m", ms: 120_000 },
] as const;

export const AUTO_LOCK_OPTIONS = [
  { id: "immediate", ms: 0 },
  { id: "1m", ms: 60_000 },
  { id: "5m", ms: 5 * 60_000 },
  { id: "15m", ms: 15 * 60_000 },
  { id: "30m", ms: 30 * 60_000 },
  { id: "1h", ms: 60 * 60_000 },
  { id: "never", ms: -1 },
] as const;

export const TRASH_RETENTION = [
  { id: "never", days: 0 },
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
] as const;

export const LOCALES = ["en", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];

export const NETWORK_POLICY = {
  desktop: "DeepKey desktop does not make outbound network requests for vault features. No telemetry, analytics, ads, or remote fonts are included.",
  web: "The self-hosted web app only talks to your own DeepKey server.",
} as const;

export * from "./logger.js";
