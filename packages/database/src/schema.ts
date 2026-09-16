import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const vaultHeader = sqliteTable("vault_header", {
  id: integer("id").primaryKey().default(1),
  payload: text("payload").notNull(),
});

export const records = sqliteTable("records", {
  id: text("id").primaryKey(),
  nonce: text("nonce").notNull(),
  ciphertext: text("ciphertext").notNull(),
  aad: text("aad").notNull(),
  cryptoVersion: integer("crypto_version").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  nonce: text("nonce").notNull(),
  ciphertext: text("ciphertext").notNull(),
  cryptoVersion: integer("crypto_version").notNull(),
  byteLength: integer("byte_length").notNull(),
});

export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  kdf: text("kdf").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const authAttempts = sqliteTable("auth_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  at: integer("at").notNull(),
  success: integer("success").notNull(),
});

export const schemaInfo = sqliteTable("schema_info", {
  version: integer("version").primaryKey(),
  appliedAt: integer("applied_at").notNull(),
});
