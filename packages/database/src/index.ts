import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type { StoredAttachment, StoredRecord, VaultHeader } from "@deepkey/types";
import * as schema from "./schema.js";

export const CURRENT_SCHEMA_VERSION = 1;

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS vault_header (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        aad TEXT NOT NULL,
        crypto_version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        crypto_version INTEGER NOT NULL,
        byte_length INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        kdf TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        at INTEGER NOT NULL,
        success INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_info (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `,
  },
];

export function openDatabase(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function migrate(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_info (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`);
  const row = sqlite.prepare("SELECT MAX(version) as version FROM schema_info").get() as { version: number | null };
  let current = row?.version ?? 0;
  const tx = sqlite.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      sqlite.exec(migration.sql);
      sqlite.prepare("INSERT INTO schema_info (version, applied_at) VALUES (?, ?)").run(migration.version, Date.now());
      current = migration.version;
    }
  });
  tx();
}

export function sqliteVaultStore(filePath: string) {
  const { sqlite, db } = openDatabase(filePath);

  return {
    sqlite,
    db,
    async getHeader(): Promise<VaultHeader | null> {
      const row = db.select().from(schema.vaultHeader).where(eq(schema.vaultHeader.id, 1)).get();
      return row ? (JSON.parse(row.payload) as VaultHeader) : null;
    },
    async setHeader(header: VaultHeader): Promise<void> {
      const payload = JSON.stringify(header);
      sqlite.prepare("INSERT INTO vault_header (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload").run(payload);
    },
    async listRecords(): Promise<StoredRecord[]> {
      return db.select().from(schema.records).all().map(fromRecordRow);
    },
    async putRecord(record: StoredRecord): Promise<void> {
      sqlite
        .prepare(
          `INSERT INTO records (id, nonce, ciphertext, aad, crypto_version, created_at, updated_at, deleted_at)
           VALUES (@id, @nonce, @ciphertext, @aad, @cryptoVersion, @createdAt, @updatedAt, @deletedAt)
           ON CONFLICT(id) DO UPDATE SET
             nonce = excluded.nonce,
             ciphertext = excluded.ciphertext,
             aad = excluded.aad,
             crypto_version = excluded.crypto_version,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at`,
        )
        .run(record);
    },
    async deleteRecord(id: string): Promise<void> {
      sqlite.prepare("DELETE FROM records WHERE id = ?").run(id);
    },
    async listAttachments(): Promise<StoredAttachment[]> {
      return db.select().from(schema.attachments).all().map(fromAttachmentRow);
    },
    async putAttachment(attachment: StoredAttachment): Promise<void> {
      sqlite
        .prepare(
          `INSERT INTO attachments (id, record_id, nonce, ciphertext, crypto_version, byte_length)
           VALUES (@id, @recordId, @nonce, @ciphertext, @cryptoVersion, @byteLength)
           ON CONFLICT(id) DO UPDATE SET
             record_id = excluded.record_id,
             nonce = excluded.nonce,
             ciphertext = excluded.ciphertext,
             crypto_version = excluded.crypto_version,
             byte_length = excluded.byte_length`,
        )
        .run(attachment);
    },
    async getAttachment(id: string): Promise<StoredAttachment | null> {
      const row = db.select().from(schema.attachments).where(eq(schema.attachments.id, id)).get();
      return row ? fromAttachmentRow(row) : null;
    },
    async deleteAttachment(id: string): Promise<void> {
      sqlite.prepare("DELETE FROM attachments WHERE id = ?").run(id);
    },
    async replaceAll(header: VaultHeader, records: StoredRecord[], attachments: StoredAttachment[]): Promise<void> {
      const tx = sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM attachments").run();
        sqlite.prepare("DELETE FROM records").run();
        sqlite.prepare("DELETE FROM vault_header").run();
        sqlite.prepare("INSERT INTO vault_header (id, payload) VALUES (1, ?)").run(JSON.stringify(header));
        const insertRecord = sqlite.prepare(
          `INSERT INTO records (id, nonce, ciphertext, aad, crypto_version, created_at, updated_at, deleted_at)
           VALUES (@id, @nonce, @ciphertext, @aad, @cryptoVersion, @createdAt, @updatedAt, @deletedAt)`,
        );
        for (const record of records) insertRecord.run(record);
        const insertAtt = sqlite.prepare(
          `INSERT INTO attachments (id, record_id, nonce, ciphertext, crypto_version, byte_length)
           VALUES (@id, @recordId, @nonce, @ciphertext, @cryptoVersion, @byteLength)`,
        );
        for (const attachment of attachments) insertAtt.run(attachment);
      });
      tx();
    },
    async wipe(): Promise<void> {
      const tx = sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM attachments").run();
        sqlite.prepare("DELETE FROM records").run();
        sqlite.prepare("DELETE FROM vault_header").run();
        sqlite.prepare("DELETE FROM kv").run();
      });
      tx();
    },
    getKv(key: string): string | null {
      const row = sqlite.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setKv(key: string, value: string): void {
      sqlite.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
    },
  };
}

function fromRecordRow(row: typeof schema.records.$inferSelect): StoredRecord {
  return {
    id: row.id,
    nonce: row.nonce,
    ciphertext: row.ciphertext,
    aad: row.aad,
    cryptoVersion: row.cryptoVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  };
}

function fromAttachmentRow(row: typeof schema.attachments.$inferSelect): StoredAttachment {
  return {
    id: row.id,
    recordId: row.recordId,
    nonce: row.nonce,
    ciphertext: row.ciphertext,
    cryptoVersion: row.cryptoVersion,
    byteLength: row.byteLength,
  };
}

export * as schema from "./schema.js";
export { resolveLocalVaultDb } from "./paths.js";
