import {
  APP_VERSION,
  AAD_RECORD,
  BACKUP_FORMAT_VERSION,
  MAGIC_BACKUP,
} from "@deepkey/config";
import {
  createVaultHeader,
  decryptAttachment,
  decryptRecord,
  disposeBytes,
  encryptAttachment,
  encryptRecord,
  envelopeFromParts,
  rewrapDek,
  unlockDek,
} from "@deepkey/crypto";
import { envEntriesToMap, parseEnv, serializeCompose, serializeEnv, serializeKubernetesSecret } from "@deepkey/env-parser";
import type {
  AppSettings,
  BackupFile,
  EnvDiffRow,
  EnvEntry,
  EnvExportFormat,
  EnvImportDecision,
  KdfParams,
  StoredAttachment,
  StoredRecord,
  VaultDocument,
  VaultEnvironment,
  VaultHeader,
  VaultItem,
  VaultProfile,
  VaultProject,
  VaultRevision,
} from "@deepkey/types";
import { DEFAULT_APP_SETTINGS, emptyItem, mergeAppSettings } from "@deepkey/types";
import { backupFileSchema } from "@deepkey/validation";
import type { VaultStore } from "./store.js";
import { changedFields, matchesQuery, newId, now } from "./util.js";

export interface SearchHit {
  id: string;
  kind: "item" | "project" | "environment" | "command";
  title: string;
  subtitle: string;
  type?: string;
}

export type CommandId =
  | "new-secret"
  | "new-project"
  | "import-env"
  | "compare-env"
  | "lock"
  | "generator"
  | "settings";

const COMMANDS: { id: CommandId; title: string; keywords: string }[] = [
  { id: "new-secret", title: "New Secret", keywords: "create add secret" },
  { id: "new-project", title: "New Project", keywords: "create add project" },
  { id: "import-env", title: "Import .env", keywords: "import dotenv env" },
  { id: "compare-env", title: "Compare environments", keywords: "diff compare env staging production" },
  { id: "lock", title: "Lock Vault", keywords: "lock" },
  { id: "generator", title: "Generator", keywords: "password token uuid passphrase" },
  { id: "settings", title: "Settings", keywords: "preferences" },
];

export class VaultEngine {
  private dek: Uint8Array | null = null;
  private header: VaultHeader | null = null;
  private documents = new Map<string, VaultDocument>();
  private settings: AppSettings = structuredClone(DEFAULT_APP_SETTINGS);
  readonly store: VaultStore;

  constructor(store: VaultStore) {
    this.store = store;
  }

  get unlocked(): boolean {
    return this.dek !== null;
  }

  get vaultHeader(): VaultHeader | null {
    return this.header;
  }

  get appSettings(): AppSettings {
    return this.settings;
  }

  applySettings(next: AppSettings): void {
    this.settings = mergeAppSettings(next);
  }

  async hasVault(): Promise<boolean> {
    return (await this.store.getHeader()) !== null;
  }

  async create(
    masterPassword: string,
    displayName: string,
    options?: { kdf?: Omit<KdfParams, "salt"> },
  ): Promise<void> {
    if (await this.hasVault()) {
      throw new Error("A vault already exists.");
    }
    const created = await createVaultHeader(masterPassword, displayName, options?.kdf ? { kdf: options.kdf } : undefined);
    this.header = created.header;
    this.dek = created.dek;
    await this.store.setHeader(created.header);
    const profile: VaultProfile = {
      kind: "profile",
      id: "profile",
      displayName,
      avatarDataUrl: null,
      locale: "en",
      timeFormat: "24h",
    };
    await this.putDocument(profile);
    const personal = await this.createProject("Personal", "Default project");
    await this.createEnvironment(personal.id, "Development");
    await this.createEnvironment(personal.id, "Staging");
    await this.createEnvironment(personal.id, "Production");
  }

  async unlock(masterPassword: string): Promise<void> {
    const header = await this.store.getHeader();
    if (!header) throw new Error("No vault found.");
    const dek = unlockDek(masterPassword, header);
    this.header = header;
    this.dek = dek;
    await this.reload();
    await this.purgeExpiredTrash();
  }

  async unlockWithDek(dek: Uint8Array): Promise<void> {
    const header = await this.store.getHeader();
    if (!header) throw new Error("No vault found.");
    this.header = header;
    this.dek = dek;
    await this.reload();
    await this.purgeExpiredTrash();
  }

  copyDek(): Uint8Array | null {
    if (!this.dek) return null;
    return new Uint8Array(this.dek);
  }

  lock(): void {
    disposeBytes(this.dek);
    this.dek = null;
    this.documents.clear();
  }

  async changeMasterPassword(current: string, next: string): Promise<void> {
    const dek = this.requireDek();
    const header = this.requireHeader();
    const updated = rewrapDek(dek, current, next, header);
    await this.store.setHeader(updated);
    this.header = updated;
  }

  verifyMasterPassword(password: string): boolean {
    try {
      const dek = unlockDek(password, this.requireHeader());
      const current = this.requireDek();
      const same = dek.length === current.length && dek.every((byte, i) => byte === current[i]);
      disposeBytes(dek);
      return same;
    } catch {
      return false;
    }
  }

  private requireDek(): Uint8Array {
    if (!this.dek) throw new Error("Vault is locked.");
    return this.dek;
  }

  private requireHeader(): VaultHeader {
    if (!this.header) throw new Error("Vault is locked.");
    return this.header;
  }

  private async reload(): Promise<void> {
    const dek = this.requireDek();
    const records = await this.store.listRecords();
    const docs = new Map<string, VaultDocument>();
    for (const record of records) {
      const envelope = envelopeFromParts(record.nonce, record.ciphertext, record.cryptoVersion);
      const doc = decryptRecord<VaultDocument>(dek, envelope);
      docs.set(doc.id, doc);
    }
    this.documents = docs;
  }

  private async putDocument(doc: VaultDocument): Promise<void> {
    const dek = this.requireDek();
    const envelope = encryptRecord(dek, doc);
    const existing = this.documents.get(doc.id);
    const record: StoredRecord = {
      id: doc.id,
      nonce: envelope.n,
      ciphertext: envelope.c,
      aad: AAD_RECORD,
      cryptoVersion: envelope.v,
      createdAt: "createdAt" in doc ? doc.createdAt : now(),
      updatedAt: "updatedAt" in doc ? doc.updatedAt : now(),
      deletedAt: "deletedAt" in doc ? (doc.deletedAt as number | null) : existing && "deletedAt" in existing ? existing.deletedAt : null,
    };
    if (doc.kind === "revision") {
      record.deletedAt = null;
    }
    await this.store.putRecord(record);
    this.documents.set(doc.id, doc);
  }

  items(includeDeleted = false): VaultItem[] {
    return [...this.documents.values()].filter((d): d is VaultItem => d.kind === "item" && (includeDeleted || !d.deletedAt));
  }

  projects(includeDeleted = false): VaultProject[] {
    return [...this.documents.values()].filter((d): d is VaultProject => d.kind === "project" && (includeDeleted || !d.deletedAt) && !d.archived);
  }

  allProjects(): VaultProject[] {
    return [...this.documents.values()].filter((d): d is VaultProject => d.kind === "project" && !d.deletedAt);
  }

  environments(projectId?: string): VaultEnvironment[] {
    return [...this.documents.values()]
      .filter((d): d is VaultEnvironment => d.kind === "environment" && !d.deletedAt && (!projectId || d.projectId === projectId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  revisions(itemId: string): VaultRevision[] {
    return [...this.documents.values()]
      .filter((d): d is VaultRevision => d.kind === "revision" && d.itemId === itemId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  profile(): VaultProfile | null {
    const doc = this.documents.get("profile");
    return doc?.kind === "profile" ? doc : null;
  }

  getItem(id: string): VaultItem | null {
    const doc = this.documents.get(id);
    return doc?.kind === "item" ? doc : null;
  }

  getProject(id: string): VaultProject | null {
    const doc = this.documents.get(id);
    return doc?.kind === "project" ? doc : null;
  }

  getEnvironment(id: string): VaultEnvironment | null {
    const doc = this.documents.get(id);
    return doc?.kind === "environment" ? doc : null;
  }

  async saveProfile(profile: VaultProfile): Promise<void> {
    await this.putDocument(profile);
    if (this.header && profile.displayName !== this.header.displayName) {
      this.header = { ...this.header, displayName: profile.displayName };
      await this.store.setHeader(this.header);
    }
  }

  async createProject(name: string, description = ""): Promise<VaultProject> {
    const t = now();
    const project: VaultProject = {
      kind: "project",
      id: newId(),
      name,
      description,
      archived: false,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
    await this.putDocument(project);
    return project;
  }

  async updateProject(id: string, patch: Partial<Pick<VaultProject, "name" | "description" | "archived">>): Promise<VaultProject> {
    const project = this.getProject(id);
    if (!project) throw new Error("Project not found.");
    const next = { ...project, ...patch, updatedAt: now() };
    await this.putDocument(next);
    return next;
  }

  async duplicateProject(id: string): Promise<VaultProject> {
    const project = this.getProject(id);
    if (!project) throw new Error("Project not found.");
    const copy = await this.createProject(`${project.name} copy`, project.description);
    const envs = this.environments(id);
    const envMap = new Map<string, string>();
    for (const env of envs) {
      const created = await this.createEnvironment(copy.id, env.name);
      envMap.set(env.id, created.id);
    }
    for (const item of this.items().filter((i) => i.projectId === id)) {
      await this.createItem({
        ...item,
        id: newId(),
        name: item.name,
        projectId: copy.id,
        environmentId: item.environmentId ? envMap.get(item.environmentId) ?? null : null,
        createdAt: now(),
        updatedAt: now(),
        lastAccessedAt: null,
      });
    }
    return copy;
  }

  async deleteProject(id: string): Promise<void> {
    const project = this.getProject(id);
    if (!project) throw new Error("Project not found.");
    const t = now();
    await this.putDocument({ ...project, deletedAt: t, updatedAt: t });
    for (const env of this.environments(id)) {
      await this.putDocument({ ...env, deletedAt: t, updatedAt: t });
    }
    for (const item of this.items().filter((i) => i.projectId === id)) {
      await this.putDocument({ ...item, deletedAt: t, updatedAt: t });
    }
  }

  async createEnvironment(projectId: string, name: string): Promise<VaultEnvironment> {
    const t = now();
    const env: VaultEnvironment = {
      kind: "environment",
      id: newId(),
      projectId,
      name,
      sortOrder: this.environments(projectId).length,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
    await this.putDocument(env);
    return env;
  }

  async renameEnvironment(id: string, name: string): Promise<void> {
    const env = this.getEnvironment(id);
    if (!env) throw new Error("Environment not found.");
    await this.putDocument({ ...env, name, updatedAt: now() });
  }

  async deleteEnvironment(id: string): Promise<void> {
    const env = this.getEnvironment(id);
    if (!env) throw new Error("Environment not found.");
    const t = now();
    await this.putDocument({ ...env, deletedAt: t, updatedAt: t });
  }

  async createItem(partial: Partial<VaultItem> & Pick<VaultItem, "type" | "name">): Promise<VaultItem> {
    const item = emptyItem({
      id: partial.id ?? newId(),
      ...partial,
    });
    await this.putDocument(item);
    return item;
  }

  async updateItem(id: string, patch: Partial<VaultItem>, recordHistory = true): Promise<VaultItem> {
    const current = this.getItem(id);
    if (!current || current.deletedAt) throw new Error("Item not found.");
    const next: VaultItem = {
      ...current,
      ...patch,
      id: current.id,
      kind: "item",
      createdAt: current.createdAt,
      updatedAt: now(),
    };
    if (recordHistory) {
      const fields = changedFields(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, [
        "name",
        "type",
        "fields",
        "notes",
        "description",
        "tags",
        "projectId",
        "environmentId",
        "expiresAt",
        "customFields",
      ]);
      if (fields.length) {
        await this.addRevision(current, fields);
      }
    }
    await this.putDocument(next);
    return next;
  }

  private async addRevision(item: VaultItem, changed: string[]): Promise<void> {
    const limit = this.settings.security.historyLimit;
    const revision: VaultRevision = {
      kind: "revision",
      id: newId(),
      itemId: item.id,
      snapshot: item,
      changedFields: changed,
      createdAt: now(),
    };
    await this.putDocument(revision);
    const all = this.revisions(item.id);
    if (all.length > limit) {
      const extra = all.slice(limit);
      for (const rev of extra) {
        await this.store.deleteRecord(rev.id);
        this.documents.delete(rev.id);
      }
    }
  }

  async touchItem(id: string): Promise<void> {
    const item = this.getItem(id);
    if (!item) return;
    await this.putDocument({ ...item, lastAccessedAt: now() });
  }

  async duplicateItem(id: string): Promise<VaultItem> {
    const item = this.getItem(id);
    if (!item) throw new Error("Item not found.");
    return this.createItem({
      ...item,
      id: newId(),
      name: `${item.name} copy`,
      lastAccessedAt: null,
    });
  }

  async trashItem(id: string): Promise<void> {
    const item = this.getItem(id);
    if (!item) throw new Error("Item not found.");
    await this.putDocument({ ...item, deletedAt: now(), updatedAt: now() });
  }

  async restoreItem(id: string): Promise<void> {
    const item = this.getItem(id);
    if (!item) throw new Error("Item not found.");
    await this.putDocument({ ...item, deletedAt: null, updatedAt: now() });
  }

  async deletePermanent(id: string): Promise<void> {
    const item = this.getItem(id);
    if (item?.attachmentId) {
      await this.store.deleteAttachment(item.attachmentId);
    }
    for (const rev of this.revisions(id)) {
      await this.store.deleteRecord(rev.id);
      this.documents.delete(rev.id);
    }
    await this.store.deleteRecord(id);
    this.documents.delete(id);
  }

  trashItems(): VaultItem[] {
    return [...this.documents.values()].filter((d): d is VaultItem => d.kind === "item" && Boolean(d.deletedAt));
  }

  async emptyTrash(): Promise<void> {
    for (const item of this.trashItems()) {
      await this.deletePermanent(item.id);
    }
  }

  async purgeExpiredTrash(): Promise<void> {
    const days = this.settings.security.trashRetentionDays;
    if (!days) return;
    const cutoff = now() - days * 24 * 60 * 60 * 1000;
    for (const item of this.trashItems()) {
      if ((item.deletedAt ?? 0) <= cutoff) {
        await this.deletePermanent(item.id);
      }
    }
  }

  async restoreRevision(itemId: string, revisionId: string): Promise<VaultItem> {
    const revision = this.documents.get(revisionId);
    if (!revision || revision.kind !== "revision" || revision.itemId !== itemId) {
      throw new Error("Revision not found.");
    }
    return this.updateItem(itemId, revision.snapshot);
  }

  async putFile(itemId: string, filename: string, mime: string, bytes: Uint8Array): Promise<VaultItem> {
    const item = this.getItem(itemId);
    if (!item) throw new Error("Item not found.");
    const max = this.settings.security.maxAttachmentBytes;
    if (bytes.byteLength > max) {
      throw new Error(`File exceeds the ${Math.round(max / 1024 / 1024)} MB limit.`);
    }
    const dek = this.requireDek();
    if (item.attachmentId) {
      await this.store.deleteAttachment(item.attachmentId);
    }
    const envelope = encryptAttachment(dek, bytes);
    const attachment: StoredAttachment = {
      id: newId(),
      recordId: item.id,
      nonce: envelope.n,
      ciphertext: envelope.c,
      cryptoVersion: envelope.v,
      byteLength: bytes.byteLength,
    };
    await this.store.putAttachment(attachment);
    return this.updateItem(itemId, {
      attachmentId: attachment.id,
      attachmentName: filename,
      attachmentMime: mime,
      type: "file",
    });
  }

  async readFile(itemId: string): Promise<{ name: string; mime: string; bytes: Uint8Array }> {
    const item = this.getItem(itemId);
    if (!item?.attachmentId) throw new Error("No file on this item.");
    const stored = await this.store.getAttachment(item.attachmentId);
    if (!stored) throw new Error("File not found.");
    const dek = this.requireDek();
    const bytes = decryptAttachment(dek, envelopeFromParts(stored.nonce, stored.ciphertext, stored.cryptoVersion));
    return { name: item.attachmentName ?? "file", mime: item.attachmentMime ?? "application/octet-stream", bytes };
  }

  envItems(projectId: string, environmentId: string): VaultItem[] {
    return this.items()
      .filter((i) => i.type === "env_var" && i.projectId === projectId && i.environmentId === environmentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  toEnvEntries(projectId: string, environmentId: string): EnvEntry[] {
    return this.envItems(projectId, environmentId).map((item, index) => ({
      key: item.name,
      value: item.fields.value ?? "",
      comment: item.description || null,
      enabled: true,
      line: index + 1,
    }));
  }

  exportEnv(projectId: string, environmentId: string, format: EnvExportFormat = "dotenv"): string {
    const entries = this.toEnvEntries(projectId, environmentId);
    if (format === "compose") return serializeCompose(entries);
    if (format === "kubernetes") {
      const project = this.getProject(projectId);
      const env = this.getEnvironment(environmentId);
      return serializeKubernetesSecret(entries, `${project?.name ?? "deepkey"}-${env?.name ?? "env"}`);
    }
    return serializeEnv(entries);
  }

  diffEnvironments(projectId: string, leftId: string, rightId: string): EnvDiffRow[] {
    const left = envEntriesToMap(this.toEnvEntries(projectId, leftId));
    const right = envEntriesToMap(this.toEnvEntries(projectId, rightId));
    const keys = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b));
    return keys.map((key) => {
      const l = left.get(key)?.value ?? null;
      const r = right.get(key)?.value ?? null;
      let status: EnvDiffRow["status"] = "same";
      if (l === null) status = "added";
      else if (r === null) status = "removed";
      else if (l !== r) status = "changed";
      return { key, status, left: l, right: r };
    });
  }

  previewEnvImport(
    projectId: string,
    environmentId: string,
    source: string,
  ): {
    parsed: ReturnType<typeof parseEnv>;
    created: EnvEntry[];
    existing: EnvEntry[];
    changed: { key: string; from: string; to: string }[];
  } {
    const parsed = parseEnv(source);
    const current = envEntriesToMap(this.toEnvEntries(projectId, environmentId));
    const created: EnvEntry[] = [];
    const existing: EnvEntry[] = [];
    const changed: { key: string; from: string; to: string }[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.entries) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      const prev = current.get(entry.key);
      if (!prev) created.push(entry);
      else if (prev.value === entry.value) existing.push(entry);
      else changed.push({ key: entry.key, from: prev.value, to: entry.value });
    }
    return { parsed, created, existing, changed };
  }

  async applyEnvImport(
    projectId: string,
    environmentId: string,
    source: string,
    decisions: EnvImportDecision[],
  ): Promise<void> {
    const parsed = parseEnv(source);
    const byKey = envEntriesToMap(parsed.entries);
    const existingItems = this.envItems(projectId, environmentId);
    const existingByKey = new Map(existingItems.map((i) => [i.name, i]));
    for (const decision of decisions) {
      const entry = byKey.get(decision.key);
      if (!entry) continue;
      if (decision.action === "skip" || decision.action === "keep") continue;
      const current = existingByKey.get(decision.key);
      if (decision.action === "create" && !current) {
        await this.createItem({
          type: "env_var",
          name: entry.key,
          projectId,
          environmentId,
          description: entry.comment ?? "",
          fields: { value: entry.value },
        });
      } else if (decision.action === "replace" && current) {
        await this.updateItem(current.id, {
          fields: { ...current.fields, value: entry.value },
          description: entry.comment ?? current.description,
        });
      }
    }
  }

  async replaceEnvFromRaw(projectId: string, environmentId: string, source: string): Promise<void> {
    const parsed = parseEnv(source);
    if (parsed.errors.length) {
      throw new Error(parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join("\n"));
    }
    const existing = this.envItems(projectId, environmentId);
    const byKey = new Map(existing.map((i) => [i.name, i]));
    const keep = new Set<string>();
    for (const entry of parsed.entries) {
      keep.add(entry.key);
      const current = byKey.get(entry.key);
      if (!current) {
        await this.createItem({
          type: "env_var",
          name: entry.key,
          projectId,
          environmentId,
          description: entry.comment ?? "",
          fields: { value: entry.value },
        });
      } else if (current.fields.value !== entry.value || current.description !== (entry.comment ?? "")) {
        await this.updateItem(current.id, {
          fields: { ...current.fields, value: entry.value },
          description: entry.comment ?? "",
        });
      }
    }
    for (const item of existing) {
      if (!keep.has(item.name)) {
        await this.trashItem(item.id);
      }
    }
  }

  async exportBackup(): Promise<BackupFile> {
    const header = this.requireHeader();
    return {
      magic: MAGIC_BACKUP,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: now(),
      appVersion: APP_VERSION,
      header,
      records: await this.store.listRecords(),
      attachments: await this.store.listAttachments(),
    };
  }

  async importBackup(payload: unknown): Promise<void> {
    const parsed = backupFileSchema.parse(payload);
    await this.store.replaceAll(parsed.header, parsed.records, parsed.attachments);
    this.lock();
  }

  async wipe(masterPassword: string): Promise<void> {
    unlockDek(masterPassword, this.requireHeader());
    await this.store.wipe();
    this.lock();
    this.header = null;
  }

  search(query: string): SearchHit[] {
    let q = query.trim();
    let typeFilter: string | null = null;
    const typeMatch = q.match(/\btype:([a-z_]+)\b/i);
    if (typeMatch?.[1]) {
      typeFilter = typeMatch[1].toLowerCase();
      q = q.replace(typeMatch[0], "").trim();
    }
    const hits: SearchHit[] = [];
    if (!q && !typeFilter) {
      return COMMANDS.map((c) => ({ id: c.id, kind: "command" as const, title: c.title, subtitle: "Command" }));
    }
    if (q) {
      for (const command of COMMANDS) {
        if (matchesQuery(`${command.title} ${command.keywords}`, q)) {
          hits.push({ id: command.id, kind: "command", title: command.title, subtitle: "Command" });
        }
      }
      for (const project of this.projects()) {
        if (matchesQuery(`${project.name} ${project.description}`, q)) {
          hits.push({ id: project.id, kind: "project", title: project.name, subtitle: "Project" });
        }
      }
      for (const env of this.environments()) {
        const project = env.projectId ? this.getProject(env.projectId) : null;
        if (matchesQuery(`${env.name} ${project?.name ?? ""}`, q)) {
          hits.push({
            id: env.id,
            kind: "environment",
            title: env.name,
            subtitle: project?.name ?? "Environment",
          });
        }
      }
    }
    for (const item of this.items()) {
      if (typeFilter && item.type !== typeFilter && !item.type.replaceAll("_", "").includes(typeFilter.replaceAll("_", ""))) {
        continue;
      }
      const project = item.projectId ? this.getProject(item.projectId) : null;
      const env = item.environmentId ? this.getEnvironment(item.environmentId) : null;
      const hay = [
        item.name,
        item.type,
        item.description,
        item.notes,
        item.tags.join(" "),
        item.fields.username ?? "",
        item.fields.url ?? "",
        project?.name ?? "",
        env?.name ?? "",
      ].join(" ");
      if (!q || matchesQuery(hay, q)) {
        hits.push({
          id: item.id,
          kind: "item",
          title: item.name,
          subtitle: [item.type.replace("_", " "), project?.name, env?.name].filter(Boolean).join(" · "),
          type: item.type,
        });
      }
    }
    return hits.slice(0, 40);
  }

  favorites(limit = 8): VaultItem[] {
    return this.items()
      .filter((item) => item.favorite)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  recentlyUsed(limit = 8): VaultItem[] {
    return this.items()
      .filter((i) => i.lastAccessedAt)
      .sort((a, b) => (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0))
      .slice(0, limit);
  }

  recentlyUpdated(limit = 8): VaultItem[] {
    return [...this.items()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }

  expiringSoon(withinDays = 14): VaultItem[] {
    const upper = now() + withinDays * 24 * 60 * 60 * 1000;
    return this.items()
      .filter((i) => i.expiresAt && i.expiresAt <= upper)
      .sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));
  }

  stats() {
    return {
      items: this.items().length,
      projects: this.projects().length,
      notes: this.items().filter((i) => i.type === "secure_note").length,
      files: this.items().filter((i) => i.type === "file").length,
      envVars: this.items().filter((i) => i.type === "env_var").length,
    };
  }
}

export function inspectBackup(payload: unknown): {
  exportedAt: number;
  appVersion: string;
  records: number;
  attachments: number;
  displayName: string;
} {
  const parsed = backupFileSchema.parse(payload);
  return {
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    records: parsed.records.length,
    attachments: parsed.attachments.length,
    displayName: parsed.header.displayName,
  };
}

export function verifyBackupPassword(payload: unknown, password: string): boolean {
  try {
    const parsed = backupFileSchema.parse(payload);
    const dek = unlockDek(password, parsed.header);
    disposeBytes(dek);
    return true;
  } catch {
    return false;
  }
}

export { MemoryVaultStore } from "./store.js";
export type { VaultStore } from "./store.js";
export { generateSecret, DEFAULT_GENERATOR } from "./generator.js";
export { itemSecret, newId } from "./util.js";
