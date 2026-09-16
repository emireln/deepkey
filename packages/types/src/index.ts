export type Locale = "en" | "pt-BR";
export type PlatformKind = "desktop" | "web";
export type Density = "comfortable" | "compact";
export type Theme = "dark" | "light";
export type SidebarMode = "expanded" | "collapsed" | "remember";

export type ItemType =
  | "api_key"
  | "token"
  | "credential"
  | "env_var"
  | "database"
  | "ssh_key"
  | "certificate"
  | "webhook"
  | "secure_note"
  | "file"
  | "custom";

export type DocumentKind = "item" | "project" | "environment" | "revision" | "profile";

export interface KdfParams {
  algorithm: "argon2id";
  version: number;
  t: number;
  m: number;
  p: number;
  dkLen: number;
  salt: string;
}

export interface CryptoEnvelope {
  v: number;
  alg: "xchacha20poly1305";
  n: string;
  c: string;
}

export interface VaultHeader {
  formatVersion: number;
  cryptoVersion: number;
  createdAt: number;
  kdf: KdfParams;
  wrappedDek: CryptoEnvelope;
  displayName: string;
}

export interface StoredRecord {
  id: string;
  nonce: string;
  ciphertext: string;
  aad: string;
  cryptoVersion: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface StoredAttachment {
  id: string;
  recordId: string;
  nonce: string;
  ciphertext: string;
  cryptoVersion: number;
  byteLength: number;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
  secret?: boolean;
}

export interface VaultItem {
  kind: "item";
  id: string;
  type: ItemType;
  name: string;
  projectId: string | null;
  environmentId: string | null;
  favorite: boolean;
  tags: string[];
  expiresAt: number | null;
  notes: string;
  description: string;
  fields: Record<string, string>;
  customFields: CustomField[];
  attachmentId: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  lastAccessedAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface VaultProject {
  kind: "project";
  id: string;
  name: string;
  description: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface VaultEnvironment {
  kind: "environment";
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface VaultRevision {
  kind: "revision";
  id: string;
  itemId: string;
  snapshot: VaultItem;
  changedFields: string[];
  createdAt: number;
}

export interface VaultProfile {
  kind: "profile";
  id: "profile";
  displayName: string;
  avatarDataUrl: string | null;
  locale: Locale;
  timeFormat: "12h" | "24h";
}

export type VaultDocument =
  | VaultItem
  | VaultProject
  | VaultEnvironment
  | VaultRevision
  | VaultProfile;

export interface UiSettings {
  theme: Theme;
  density: Density;
  sidebar: "expanded" | "collapsed";
  rememberSidebar: boolean;
  locale: Locale;
  defaultProjectId: string | null;
  defaultEnvironmentId: string | null;
  launchAtStartup: boolean;
  trayEnabled: boolean;
  globalShortcutEnabled: boolean;
}

export interface SecuritySettings {
  autoLockMs: number;
  lockOnSleep: boolean;
  lockOnDesktopLock: boolean;
  lockOnExit: boolean;
  lockOnBackground: boolean;
  clipboardTimeoutMs: number;
  privacyMode: boolean;
  contentProtection: boolean;
  revealMs: number;
  historyLimit: number;
  trashRetentionDays: number;
  maxAttachmentBytes: number;
  requirePasswordForExport: boolean;
  osUnlockEnabled: boolean;
  notifyExpiring: boolean;
  allowSecretNamesInNotifications: boolean;
}

export interface BackupSettings {
  autoBackup: boolean;
  autoBackupHours: number;
  autoBackupDir: string | null;
  lastBackupAt: number | null;
}

export interface AppSettings {
  ui: UiSettings;
  security: SecuritySettings;
  backup: BackupSettings;
}

export interface EnvEntry {
  key: string;
  value: string;
  comment: string | null;
  enabled: boolean;
  line: number;
  raw?: string;
}

export interface EnvParseResult {
  entries: EnvEntry[];
  comments: { line: number; text: string }[];
  duplicates: string[];
  errors: { line: number; message: string }[];
}

export interface EnvImportDecision {
  key: string;
  action: "create" | "replace" | "keep" | "skip";
}

export type GeneratorKind = "password" | "token" | "hex" | "base64" | "uuid" | "passphrase";
export type EnvExportFormat = "dotenv" | "compose" | "kubernetes";

export interface GeneratorOptions {
  kind: GeneratorKind;
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export interface EnvDiffRow {
  key: string;
  status: "added" | "removed" | "changed" | "same";
  left: string | null;
  right: string | null;
}

export interface BackupFile {
  magic: "DEEPKEYVAULT";
  formatVersion: number;
  exportedAt: number;
  appVersion: string;
  header: VaultHeader;
  records: StoredRecord[];
  attachments: StoredAttachment[];
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  theme: "dark",
  density: "comfortable",
  sidebar: "expanded",
  rememberSidebar: true,
  locale: "en",
  defaultProjectId: null,
  defaultEnvironmentId: null,
  launchAtStartup: false,
  trayEnabled: true,
  globalShortcutEnabled: false,
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  autoLockMs: 15 * 60 * 1000,
  lockOnSleep: true,
  lockOnDesktopLock: true,
  lockOnExit: true,
  lockOnBackground: false,
  clipboardTimeoutMs: 30_000,
  privacyMode: false,
  contentProtection: false,
  revealMs: 15_000,
  historyLimit: 25,
  trashRetentionDays: 30,
  maxAttachmentBytes: 5 * 1024 * 1024,
  requirePasswordForExport: true,
  osUnlockEnabled: false,
  notifyExpiring: false,
  allowSecretNamesInNotifications: false,
};

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackup: false,
  autoBackupHours: 24,
  autoBackupDir: null,
  lastBackupAt: null,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ui: DEFAULT_UI_SETTINGS,
  security: DEFAULT_SECURITY_SETTINGS,
  backup: DEFAULT_BACKUP_SETTINGS,
};

export function emptyItem(partial: Partial<VaultItem> & Pick<VaultItem, "id" | "type" | "name">): VaultItem {
  const now = Date.now();
  return {
    kind: "item",
    projectId: null,
    environmentId: null,
    favorite: false,
    tags: [],
    expiresAt: null,
    notes: "",
    description: "",
    fields: {},
    customFields: [],
    attachmentId: null,
    attachmentName: null,
    attachmentMime: null,
    lastAccessedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...partial,
  };
}
