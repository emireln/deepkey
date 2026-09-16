import type { StoredAttachment, StoredRecord, VaultHeader } from "@deepkey/types";

export interface VaultStore {
  getHeader(): Promise<VaultHeader | null>;
  setHeader(header: VaultHeader): Promise<void>;
  listRecords(): Promise<StoredRecord[]>;
  putRecord(record: StoredRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;
  listAttachments(): Promise<StoredAttachment[]>;
  putAttachment(attachment: StoredAttachment): Promise<void>;
  getAttachment(id: string): Promise<StoredAttachment | null>;
  deleteAttachment(id: string): Promise<void>;
  replaceAll(header: VaultHeader, records: StoredRecord[], attachments: StoredAttachment[]): Promise<void>;
  wipe(): Promise<void>;
}

export class MemoryVaultStore implements VaultStore {
  private header: VaultHeader | null = null;
  private records = new Map<string, StoredRecord>();
  private attachments = new Map<string, StoredAttachment>();

  async getHeader(): Promise<VaultHeader | null> {
    return this.header;
  }
  async setHeader(header: VaultHeader): Promise<void> {
    this.header = header;
  }
  async listRecords(): Promise<StoredRecord[]> {
    return [...this.records.values()];
  }
  async putRecord(record: StoredRecord): Promise<void> {
    this.records.set(record.id, record);
  }
  async deleteRecord(id: string): Promise<void> {
    this.records.delete(id);
  }
  async listAttachments(): Promise<StoredAttachment[]> {
    return [...this.attachments.values()];
  }
  async putAttachment(attachment: StoredAttachment): Promise<void> {
    this.attachments.set(attachment.id, attachment);
  }
  async getAttachment(id: string): Promise<StoredAttachment | null> {
    return this.attachments.get(id) ?? null;
  }
  async deleteAttachment(id: string): Promise<void> {
    this.attachments.delete(id);
  }
  async replaceAll(header: VaultHeader, records: StoredRecord[], attachments: StoredAttachment[]): Promise<void> {
    this.header = header;
    this.records = new Map(records.map((r) => [r.id, r]));
    this.attachments = new Map(attachments.map((a) => [a.id, a]));
  }
  async wipe(): Promise<void> {
    this.header = null;
    this.records.clear();
    this.attachments.clear();
  }
}
