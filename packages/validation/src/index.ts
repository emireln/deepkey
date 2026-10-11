import { z } from "zod";

export const envelopeSchema = z.object({
  v: z.number().int().positive(),
  alg: z.literal("xchacha20poly1305"),
  n: z.string().min(8),
  c: z.string().min(8),
});

export const kdfSchema = z.object({
  algorithm: z.literal("argon2id"),
  version: z.number(),
  t: z.number().int().min(3),
  m: z.number().int().min(19456),
  p: z.number().int().min(1),
  dkLen: z.literal(32),
  salt: z.string().min(8),
});

export const vaultHeaderSchema = z.object({
  formatVersion: z.number().int().positive(),
  cryptoVersion: z.number().int().positive(),
  createdAt: z.number(),
  kdf: kdfSchema,
  wrappedDek: envelopeSchema,
  displayName: z.string().min(1).max(80),
});

export const PREF_VALUE_MAX = 1_000_000;

export const opaqueIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._-]+$/)
  .refine((value) => !value.includes(".."), { message: "Invalid id." });

export function parseOpaqueId(id: unknown): string {
  const parsed = opaqueIdSchema.safeParse(id);
  if (!parsed.success) throw new Error("Invalid id.");
  return parsed.data;
}

export const storedRecordSchema = z.object({
  id: opaqueIdSchema,
  nonce: z.string().min(8),
  ciphertext: z.string().min(8),
  aad: z.string(),
  cryptoVersion: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export const storedAttachmentSchema = z.object({
  id: opaqueIdSchema,
  recordId: opaqueIdSchema,
  nonce: z.string().min(8),
  ciphertext: z.string().min(8),
  cryptoVersion: z.number().int(),
  byteLength: z.number().int().nonnegative(),
});

export const backupFileSchema = z.object({
  magic: z.literal("DEEPKEYVAULT"),
  formatVersion: z.number().int().positive(),
  exportedAt: z.number(),
  appVersion: z.string(),
  header: vaultHeaderSchema,
  records: z.array(storedRecordSchema),
  attachments: z.array(storedAttachmentSchema),
});

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[A-Za-z0-9._@+-]+$/);

export const authPasswordSchema = z.string().min(10).max(200);

export const masterPasswordSchema = z
  .string()
  .min(12)
  .max(200)
  .refine((value) => masterPasswordIssue(value) === null, {
    message: "Choose a longer or more varied master password.",
  });

export const itemTypeSchema = z.enum([
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
]);

export function looksLikeUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "postgres:" || u.protocol === "mysql:" || u.protocol === "redis:";
  } catch {
    return false;
  }
}

export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function looksLikePem(value: string): boolean {
  return /-----BEGIN [A-Z ]*-----[\s\S]+-----END [A-Z ]*-----/.test(value);
}

export function looksLikeSshPrivateKey(value: string): boolean {
  return (
    looksLikePem(value) &&
    /BEGIN (OPENSSH |RSA |EC |DSA )?PRIVATE KEY/.test(value)
  );
}

export function looksLikeJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function looksLikeConnectionString(value: string): boolean {
  return /^(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\//i.test(value) || /Host=.*;/i.test(value);
}

export type HintKind = "url" | "uuid" | "pem" | "ssh" | "json" | "connection" | null;

export function formatHint(value: string): HintKind {
  if (!value) return null;
  if (looksLikeSshPrivateKey(value)) return "ssh";
  if (looksLikePem(value)) return "pem";
  if (looksLikeUuid(value)) return "uuid";
  if (looksLikeConnectionString(value)) return "connection";
  if (looksLikeUrl(value)) return "url";
  if (looksLikeJson(value)) return "json";
  return null;
}

const COMMON = new Set([
  "password",
  "password123",
  "123456789012",
  "qwertyuiop",
  "letmein12345",
  "adminadmin",
  "deepkey",
  "masterpassword",
]);

/** Codes, not sentences, so the UI can translate them. */
export type PasswordHint = "length" | "lowercase" | "uppercase" | "number" | "symbol" | "common" | "name" | "variety";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "very weak" | "weak" | "fair" | "strong" | "excellent";
  hints: PasswordHint[];
}

export function scorePassword(password: string, extras: string[] = []): PasswordStrength {
  const hints: PasswordHint[] = [];
  if (password.length < 12) hints.push("length");
  if (!/[a-z]/.test(password)) hints.push("lowercase");
  if (!/[A-Z]/.test(password)) hints.push("uppercase");
  if (!/[0-9]/.test(password)) hints.push("number");
  if (!/[^A-Za-z0-9]/.test(password)) hints.push("symbol");
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) hints.push("common");
  for (const extra of extras) {
    if (extra && extra.length >= 3 && lower.includes(extra.toLowerCase())) {
      hints.push("name");
      break;
    }
  }

  let score = 0 as PasswordStrength["score"];
  if (password.length >= 12) score = 1;
  if (password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password)) score = 2;
  if (password.length >= 16 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
    score = 3;
  }
  if (password.length >= 20 && score === 3) score = 4;
  if (COMMON.has(lower) || password.length < 8) score = 0;

  const labels = ["very weak", "weak", "fair", "strong", "excellent"] as const;
  return { score, label: labels[score], hints };
}

/**
 * The master password encrypts the whole vault and nothing can reset it, so the bar is higher than
 * scorePassword's. Returns the first problem, or null when the password is acceptable.
 */
export function masterPasswordIssue(password: string): PasswordHint | null {
  if (password.length < 12) return "length";
  // A few repeated characters pass a length check but are easy to guess.
  if (new Set(password).size < 8) return "variety";
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  // Twenty characters is a passphrase. Shorter passwords need three kinds of character.
  if (password.length < 20 && kinds < 3) return "variety";
  if (COMMON.has(password.toLowerCase())) return "common";
  return null;
}

/** File name for a timed backup, e.g. deepkey-2026-10-11T09-02-33.deepkeyvault. */
export function autoBackupFileName(at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `deepkey-${stamp}.deepkeyvault`;
}

const AUTO_BACKUP_NAME = /^deepkey-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.deepkeyvault$/;

/** True only for files the timer writes. A backup the user exported by hand does not match. */
export function isAutoBackupFileName(name: string): boolean {
  return AUTO_BACKUP_NAME.test(name);
}

export function safeFilename(name: string): string {
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    return "file";
  }
  const base = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+/, "_");
  const trimmed = base.slice(0, 180) || "file";
  if (trimmed === "." || trimmed === ".." || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(trimmed)) {
    return "file";
  }
  return trimmed;
}

export function assertNoPathTraversal(name: string): void {
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new Error("Invalid filename.");
  }
}

// Desktop IPC payloads. The renderer is less trusted than the main process, so each value is parsed
// before it reaches the filesystem, the clipboard, the shell, or a notification.
export const ipcFlagSchema = z.boolean();
export const ipcTextSchema = z.string().max(1_000_000);
export const ipcShortTextSchema = z.string().max(2048);
export const ipcBytesSchema = z.instanceof(Uint8Array);
export const ipcFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !/[\\/\0]/.test(name) && !name.includes(".."), { message: "Invalid filename." });
export const ipcDirectorySchema = z
  .string()
  .max(4096)
  .refine((dir) => !dir.includes("\0"), { message: "Invalid path." })
  .nullable();
export const ipcHttpsUrlSchema = z
  .string()
  .max(2048)
  .refine((url) => url.startsWith("https://"), { message: "Blocked URL." });
export const ipcFiltersSchema = z
  .array(z.object({ name: z.string().max(100), extensions: z.array(z.string().max(20)).max(20) }))
  .optional();
export const ipcNotificationTitleSchema = z.string().max(120);
export const ipcNotificationBodySchema = z.string().max(280);
