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

export const masterPasswordSchema = z.string().min(12).max(200);

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

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "very weak" | "weak" | "fair" | "strong" | "excellent";
  hints: string[];
}

export function scorePassword(password: string, extras: string[] = []): PasswordStrength {
  const hints: string[] = [];
  if (password.length < 12) hints.push("Use at least 12 characters.");
  if (!/[a-z]/.test(password)) hints.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) hints.push("Add an uppercase letter.");
  if (!/[0-9]/.test(password)) hints.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) hints.push("Add a symbol.");
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) hints.push("Avoid common passwords.");
  for (const extra of extras) {
    if (extra && extra.length >= 3 && lower.includes(extra.toLowerCase())) {
      hints.push("Do not include your name.");
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
