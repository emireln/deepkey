import type { AppSettings, StoredAttachment, StoredRecord, VaultHeader } from "@deepkey/types";

export type OsKind = "win" | "mac" | "linux" | "web";

export interface PickedFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface PlatformAdapter {
  kind: "desktop" | "web";
  os: OsKind;
  appVersion: string;
  storage: {
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
    getDbPath(): Promise<string>;
  };
  prefs: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  auth?: {
    needsSetup(): Promise<boolean>;
    setup(username: string, password: string): Promise<void>;
    login(username: string, password: string): Promise<void>;
    logout(): Promise<void>;
    me(): Promise<{ username: string } | null>;
  };
  clipboard: {
    write(text: string): Promise<void>;
    read(): Promise<string>;
    clearIfUnchanged(expected: string): Promise<boolean>;
    supportsClear: boolean;
  };
  files: {
    open(filters?: { name: string; extensions: string[] }[]): Promise<PickedFile | null>;
    save(filename: string, bytes: Uint8Array, mime?: string): Promise<boolean>;
  };
  window?: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    setContentProtection(enabled: boolean): Promise<void>;
    onBlur(cb: () => void): () => void;
    onFocus(cb: () => void): () => void;
    onSleep(cb: () => void): () => void;
    onLock(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
  };
  osUnlock?: {
    available(): Promise<boolean>;
    storeDek(bytes: Uint8Array): Promise<void>;
    loadDek(): Promise<Uint8Array | null>;
    clear(): Promise<void>;
  };
  notifications?: {
    show(title: string, body: string): void;
  };
  desktop?: {
    setLaunchAtStartup(enabled: boolean): Promise<void>;
    setTray(enabled: boolean): Promise<void>;
  };
  openExternal(url: string): void;
}

export interface LoadedSettings {
  settings: AppSettings;
}
