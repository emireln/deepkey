import fs from "node:fs";
import path from "node:path";
import { APP_VERSION, ITEM_TYPES } from "@deepkey/config";
import { mergeAppSettings, type AppSettings, type VaultItem } from "@deepkey/types";
import { sqliteVaultStore } from "@deepkey/database";
import { DEFAULT_GENERATOR, generateSecret, inspectBackup, itemSecret, VaultEngine } from "@deepkey/vault-core";
import { masterPasswordSchema } from "@deepkey/validation";
import { playBoot, playLock, printBanner } from "./banner.js";
import {
  cancelClipboardWatch,
  clear,
  copySecret,
  IdleLock,
  ink,
  line,
  pickList,
  promptLine,
  readKey,
  restoreTerminal,
  setIdleLimit,
  waitKey,
  withSpinner,
} from "./term.js";

const SECRET_FIELDS = new Set(["value", "password", "privateKey", "certificate", "token", "secret"]);
const MAX_ENV_BYTES = 1_000_000;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

type Store = ReturnType<typeof sqliteVaultStore>;

function requireMaster(password: string): string {
  const parsed = masterPasswordSchema.safeParse(password);
  if (!parsed.success) throw new Error("Use at least 12 characters.");
  return parsed.data;
}

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("\0")) throw new Error("Invalid path.");
  return path.resolve(trimmed);
}

function writeSecretFile(dest: string, contents: string): void {
  fs.writeFileSync(resolveUserPath(dest), contents, { encoding: "utf8", mode: 0o600 });
}

function readLimitedFile(src: string, maxBytes: number): string {
  const file = resolveUserPath(src);
  const stat = fs.statSync(file);
  if (stat.size > maxBytes) throw new Error("File is too large.");
  return fs.readFileSync(file, "utf8");
}

function loadSettings(engine: VaultEngine, store: Store): AppSettings {
  let settings = mergeAppSettings(null);
  try {
    const raw = store.getKv("settings");
    if (raw) settings = mergeAppSettings(JSON.parse(raw));
  } catch {
    settings = mergeAppSettings(null);
  }
  engine.applySettings(settings);
  return settings;
}

async function confirmExportPassword(engine: VaultEngine): Promise<boolean> {
  if (!engine.appSettings.security.requirePasswordForExport) return true;
  const password = await promptLine("Master password: ", true);
  if (!engine.verifyMasterPassword(password)) {
    line(ink.red("Wrong master password."));
    await pause();
    return false;
  }
  return true;
}

async function copied(engine: VaultEngine, value: string): Promise<void> {
  const ok = await copySecret(value, engine.appSettings.security.clipboardTimeoutMs);
  line(ok ? ink.white("Copied. Clipboard clears if it still matches.") : ink.red("Could not copy."));
  await pause();
}

function typeLabel(type: string): string {
  return type.replaceAll("_", " ");
}

function mask(value: string, revealed: boolean): string {
  if (revealed) return value;
  return "•".repeat(Math.min(12, Math.max(4, value.length)));
}

function itemLine(engine: VaultEngine, item: VaultItem): string {
  const project = item.projectId ? engine.getProject(item.projectId)?.name : null;
  const extra = [typeLabel(item.type), project].filter(Boolean).join(" · ");
  return extra ? `${item.name}  ${extra}` : item.name;
}

async function pause(message = "any key"): Promise<void> {
  line();
  line(ink.dim(message));
  await waitKey();
}

async function unlockOrCreate(engine: VaultEngine): Promise<void> {
  const exists = await engine.hasVault();
  if (!exists) {
    line(ink.bold("Create your vault"));
    line(ink.dim("There is no recovery. If you forget this password, this account cannot be opened."));
    line(ink.dim("The only way to start over is to delete DeepKey data from this computer."));
    line();
    const name = (await promptLine("Display name: ")).trim();
    if (!name) throw new Error("Need a display name.");
    const password = requireMaster(await promptLine("Master password: ", true));
    const confirm = await promptLine("Confirm password: ", true);
    if (password !== confirm) throw new Error("Passwords do not match.");
    const ack = (await promptLine('Type UNDERSTAND: ')).trim().toUpperCase();
    if (ack !== "UNDERSTAND") throw new Error("Vault not created.");
    await withSpinner("Creating vault…", engine.create(password, name));
    line(ink.white("Vault created."));
    await pause();
    return;
  }
  const fromEnv = process.env.DEEPKEY_MASTER_PASSWORD;
  const password = fromEnv ?? (await promptLine("Master password: ", true));
  await withSpinner("Unlocking…", engine.unlock(password));
}

async function home(engine: VaultEngine): Promise<"lock" | "quit"> {
  const menu = [
    { id: "overview", label: "Overview" },
    { id: "vault", label: "Vault" },
    { id: "projects", label: "Projects" },
    { id: "env", label: ".env files" },
    { id: "generator", label: "Generator" },
    { id: "search", label: "Search" },
    { id: "new", label: "New secret" },
    { id: "trash", label: "Trash" },
    { id: "backup", label: "Backup" },
    { id: "security", label: "Security" },
    { id: "lock", label: "Lock" },
    { id: "quit", label: "Quit" },
  ] as const;
  for (;;) {
    const profile = engine.profile()?.displayName ?? engine.vaultHeader?.displayName ?? "deepkey";
    const stats = engine.stats();
    const idx = await pickList(
      `${profile}  ·  v${APP_VERSION}`,
      menu.map((item) => item.label),
      `${stats.items} items · ${stats.projects} projects · ↑↓ enter`,
    );
    if (idx === null) return "lock";
    const id = menu[idx]!.id;
    if (id === "lock" || id === "quit") return id;
    if (id === "overview") await overview(engine);
    if (id === "vault") await vaultList(engine);
    if (id === "projects") await projects(engine);
    if (id === "env") await envFiles(engine);
    if (id === "generator") await generator(engine);
    if (id === "search") await search(engine);
    if (id === "new") await newSecret(engine);
    if (id === "trash") await trash(engine);
    if (id === "backup") await backup(engine);
    if (id === "security") {
      const gone = await security(engine);
      if (gone) return "lock";
    }
  }
}

async function overview(engine: VaultEngine): Promise<void> {
  const stats = engine.stats();
  const fav = engine.favorites();
  const used = engine.recentlyUsed();
  const expiring = engine.expiringSoon();
  clear();
  line(ink.bold("Overview"));
  line(ink.dim("Your encrypted vault at a glance."));
  line();
  line(`  items      ${ink.white(String(stats.items))}`);
  line(`  projects   ${ink.white(String(stats.projects))}`);
  line(`  notes      ${ink.white(String(stats.notes))}`);
  line(`  .env vars  ${ink.white(String(stats.envVars))}`);
  if (fav.length) {
    line();
    line(ink.bold("Favorites"));
    for (const item of fav) line(ink.dim(`  ${itemLine(engine, item)}`));
  }
  if (used.length) {
    line();
    line(ink.bold("Recently used"));
    for (const item of used) line(ink.dim(`  ${itemLine(engine, item)}`));
  }
  if (expiring.length) {
    line();
    line(ink.bold("Expiring soon"));
    for (const item of expiring) line(ink.dim(`  ${itemLine(engine, item)}`));
  }
  await pause();
}

async function vaultList(engine: VaultEngine): Promise<void> {
  for (;;) {
    const items = engine.items().sort((a, b) => a.name.localeCompare(b.name));
    const idx = await pickList(
      "Vault",
      items.map((item) => itemLine(engine, item)),
    );
    if (idx === null) return;
    await itemDetail(engine, items[idx]!);
  }
}

async function itemDetail(engine: VaultEngine, start: VaultItem): Promise<void> {
  let reveal = false;
  for (;;) {
    const item = engine.getItem(start.id);
    if (!item || item.deletedAt) return;
    clear();
    line(ink.bold(item.name));
    line(ink.dim(typeLabel(item.type)));
    line();
    const project = item.projectId ? engine.getProject(item.projectId)?.name : "—";
    const env = item.environmentId ? engine.getEnvironment(item.environmentId)?.name : "—";
    line(`  project      ${project}`);
    line(`  environment  ${env}`);
    if (item.description) line(`  note         ${item.description}`);
    line();
    const keys = Object.keys(item.fields);
    if (!keys.length && !item.customFields.length) line(ink.dim("  no fields"));
    for (const key of keys) {
      const raw = item.fields[key] ?? "";
      const hide = SECRET_FIELDS.has(key);
      line(`  ${key.padEnd(12)} ${hide ? mask(raw, reveal) : raw}`);
    }
    for (const field of item.customFields) {
      line(`  ${field.label.padEnd(12)} ${field.secret ? mask(field.value, reveal) : field.value}`);
    }
    line();
    line(ink.dim("r reveal · c copy · t trash · esc back"));
    const key = await readKey();
    if (key.t === "esc") return;
    if (key.t === "char" && key.v.toLowerCase() === "r") {
      reveal = !reveal;
      if (reveal) await engine.touchItem(item.id);
    }
    if (key.t === "char" && key.v.toLowerCase() === "c") {
      const secret = itemSecret(item);
      if (!secret) {
        line(ink.red("Nothing to copy."));
        await pause();
      } else {
        await engine.touchItem(item.id);
        await copied(engine, secret);
      }
    }
    if (key.t === "char" && key.v.toLowerCase() === "t") {
      await engine.trashItem(item.id);
      return;
    }
  }
}

async function newSecret(engine: VaultEngine): Promise<void> {
  const types = ITEM_TYPES.filter((type) => type !== "file");
  const typeIdx = await pickList("Type", types.map(typeLabel));
  if (typeIdx === null) return;
  const type = types[typeIdx]!;
  const name = (await promptLine("Name: ")).trim();
  if (!name) return;
  const projects = engine.projects();
  let projectId: string | null = null;
  let environmentId: string | null = null;
  if (projects.length) {
    const labels = ["(none)", ...projects.map((p) => p.name)];
    const pIdx = await pickList("Project", labels);
    if (pIdx === null) return;
    if (pIdx > 0) {
      projectId = projects[pIdx - 1]!.id;
      const envs = engine.environments(projectId);
      if (envs.length) {
        const eIdx = await pickList("Environment", envs.map((e) => e.name));
        if (eIdx === null) return;
        environmentId = envs[eIdx]!.id;
      }
    }
  }
  const fields: Record<string, string> = {};
  if (type === "credential") {
    fields.username = await promptLine("Username: ");
    fields.password = await promptLine("Password: ", true);
  } else if (type === "secure_note") {
    fields.value = await promptLine("Note: ");
  } else {
    fields.value = await promptLine("Secret: ", true);
  }
  await engine.createItem({ type, name, projectId, environmentId, fields });
  line(ink.white("Saved."));
  await pause();
}

async function projects(engine: VaultEngine): Promise<void> {
  for (;;) {
    const list = engine.projects();
    const labels = ["+ New project", ...list.map((p) => p.name)];
    const idx = await pickList("Projects", labels);
    if (idx === null) return;
    if (idx === 0) {
      const name = (await promptLine("Project name: ")).trim();
      if (name) {
        const project = await engine.createProject(name);
        await engine.createEnvironment(project.id, "Development");
        await engine.createEnvironment(project.id, "Staging");
        await engine.createEnvironment(project.id, "Production");
      }
      continue;
    }
    await projectDetail(engine, list[idx - 1]!.id);
  }
}

async function projectDetail(engine: VaultEngine, projectId: string): Promise<void> {
  const project = engine.getProject(projectId);
  if (!project) return;
  const envs = engine.environments(projectId);
  const items = engine.items().filter((i) => i.projectId === projectId);
  clear();
  line(ink.bold(project.name));
  if (project.description) line(ink.dim(project.description));
  line();
  line(ink.bold("Environments"));
  for (const env of envs) {
    const n = engine.envItems(projectId, env.id).length;
    line(`  ${env.name}  ${ink.dim(`${n} vars`)}`);
  }
  line();
  line(ink.bold("Items"));
  if (!items.length) line(ink.dim("  none"));
  for (const item of items.slice(0, 20)) line(ink.dim(`  ${itemLine(engine, item)}`));
  await pause();
}

async function envFiles(engine: VaultEngine): Promise<void> {
  const projects = engine.projects();
  const pIdx = await pickList("Project", projects.map((p) => p.name));
  if (pIdx === null) return;
  const project = projects[pIdx]!;
  const envs = engine.environments(project.id);
  if (!envs.length) {
    clear();
    line(ink.dim("No environments."));
    await pause();
    return;
  }
  const actions = ["View keys", "Export to file", "Import file", "Diff two environments"];
  const aIdx = await pickList(project.name, actions);
  if (aIdx === null) return;
  if (aIdx === 0) {
    const eIdx = await pickList("Environment", envs.map((e) => e.name));
    if (eIdx === null) return;
    const vars = engine.envItems(project.id, envs[eIdx]!.id);
    clear();
    line(ink.bold(`${project.name} / ${envs[eIdx]!.name}`));
    line(ink.dim("Keys only. Values stay hidden."));
    line();
    if (!vars.length) line(ink.dim("  empty"));
    for (const item of vars) line(`  ${item.name}`);
    await pause();
    return;
  }
  if (aIdx === 1) {
    const eIdx = await pickList("Environment", envs.map((e) => e.name));
    if (eIdx === null) return;
    const dest = (await promptLine("Write to path: ")).trim();
    if (!dest) return;
    if (!(await confirmExportPassword(engine))) return;
    writeSecretFile(dest, engine.exportEnv(project.id, envs[eIdx]!.id));
    line(ink.white(`Wrote ${resolveUserPath(dest)}. Treat it as a secret.`));
    await pause();
    return;
  }
  if (aIdx === 2) {
    const eIdx = await pickList("Environment", envs.map((e) => e.name));
    if (eIdx === null) return;
    const src = (await promptLine(".env path: ")).trim();
    if (!src) {
      line(ink.red("File not found."));
      await pause();
      return;
    }
    let raw: string;
    try {
      raw = readLimitedFile(src, MAX_ENV_BYTES);
    } catch (err) {
      line(ink.red(err instanceof Error ? err.message : "Could not read file."));
      await pause();
      return;
    }
    const preview = engine.previewEnvImport(project.id, envs[eIdx]!.id, raw);
    clear();
    line(ink.bold("Import preview"));
    line(`  new      ${preview.created.length}`);
    line(`  same     ${preview.existing.length}`);
    line(`  changed  ${preview.changed.length}`);
    line();
    const go = (await promptLine("Apply? (y/N) ")).trim().toLowerCase();
    if (go !== "y") return;
    const decisions = [
      ...preview.created.map((entry) => ({ key: entry.key, action: "create" as const })),
      ...preview.changed.map((row) => ({ key: row.key, action: "replace" as const })),
      ...preview.existing.map((entry) => ({ key: entry.key, action: "keep" as const })),
    ];
    await engine.applyEnvImport(project.id, envs[eIdx]!.id, raw, decisions);
    line(ink.white("Imported."));
    await pause();
    return;
  }
  if (envs.length < 2) {
    line(ink.dim("Need two environments to diff."));
    await pause();
    return;
  }
  const left = await pickList("Left", envs.map((e) => e.name));
  if (left === null) return;
  const right = await pickList("Right", envs.map((e) => e.name));
  if (right === null) return;
  const rows = engine.diffEnvironments(project.id, envs[left]!.id, envs[right]!.id);
  clear();
  line(ink.bold(`${envs[left]!.name} → ${envs[right]!.name}`));
  line(ink.dim("Values not printed."));
  line();
  for (const row of rows) line(`  ${row.status.padEnd(8)} ${row.key}`);
  await pause();
}

async function generator(engine: VaultEngine): Promise<void> {
  const kinds = ["password", "token", "passphrase", "uuid"] as const;
  const kIdx = await pickList("Generator", [...kinds]);
  if (kIdx === null) return;
  const kind = kinds[kIdx]!;
  let value = generateSecret({ ...DEFAULT_GENERATOR, kind, length: kind === "passphrase" ? 6 : 24 });
  for (;;) {
    clear();
    line(ink.bold("Generator"));
    line(ink.dim(kind));
    line();
    line(`  ${ink.white(value)}`);
    line();
    line(ink.dim("r again · c copy · s save to vault · esc back"));
    const key = await readKey();
    if (key.t === "esc") return;
    if (key.t === "char" && key.v.toLowerCase() === "r") {
      value = generateSecret({ ...DEFAULT_GENERATOR, kind, length: kind === "passphrase" ? 6 : 24 });
    }
    if (key.t === "char" && key.v.toLowerCase() === "c") {
      await copied(engine, value);
    }
    if (key.t === "char" && key.v.toLowerCase() === "s") {
      const name = (await promptLine("Name: ")).trim();
      if (name) {
        await engine.createItem({ type: kind === "uuid" || kind === "token" ? "token" : "api_key", name, fields: { value } });
        line(ink.white("Saved."));
        await pause();
      }
    }
  }
}

async function search(engine: VaultEngine): Promise<void> {
  const q = (await promptLine("Search: ")).trim();
  if (!q) return;
  const hits = engine.search(q).filter((hit) => hit.kind === "item");
  const idx = await pickList(`Search · ${q}`, hits.map((hit) => `${hit.title}  ${hit.subtitle}`));
  if (idx === null) return;
  const item = engine.getItem(hits[idx]!.id);
  if (item) await itemDetail(engine, item);
}

async function trash(engine: VaultEngine): Promise<void> {
  for (;;) {
    const items = engine.trashItems();
    const labels = items.length ? ["Empty trash", ...items.map((item) => item.name)] : [];
    const idx = await pickList("Trash", labels);
    if (idx === null) return;
    if (idx === 0) {
      const go = (await promptLine("Empty trash? (y/N) ")).trim().toLowerCase();
      if (go === "y") await engine.emptyTrash();
      continue;
    }
    const item = items[idx - 1]!;
    await engine.restoreItem(item.id);
    line(ink.white("Restored."));
    await pause();
  }
}

async function backup(engine: VaultEngine): Promise<void> {
  const idx = await pickList("Backup", ["Export encrypted backup", "Import encrypted backup", "Verify backup file"]);
  if (idx === null) return;
  if (idx === 0) {
    const dest = (await promptLine("Write .deepkeyvault to: ")).trim();
    if (!dest) return;
    if (!(await confirmExportPassword(engine))) return;
    const payload = await engine.exportBackup();
    writeSecretFile(dest, JSON.stringify(payload));
    line(ink.white("Encrypted backup written. It still needs the master password."));
    await pause();
    return;
  }
  if (idx === 1) {
    const src = (await promptLine("Backup file: ")).trim();
    if (!src) return;
    let payload: unknown;
    try {
      payload = JSON.parse(readLimitedFile(src, MAX_BACKUP_BYTES));
      inspectBackup(payload);
    } catch (err) {
      line(ink.red(err instanceof Error ? err.message : "Invalid backup."));
      await pause();
      return;
    }
    line(ink.dim("Import replaces this vault. You will need that backup's master password."));
    const go = (await promptLine("Type IMPORT: ")).trim();
    if (go !== "IMPORT") return;
    await engine.importBackup(payload);
    line(ink.white("Imported. Unlock with the backup's master password."));
    await pause();
    throw new IdleLock();
  }
  const src = (await promptLine("Backup file: ")).trim();
  if (!src) return;
  try {
    const info = inspectBackup(JSON.parse(readLimitedFile(src, MAX_BACKUP_BYTES)));
    clear();
    line(ink.bold("Backup"));
    line();
    line(`  name     ${ink.white(info.displayName)}`);
    line(`  records  ${ink.white(String(info.records))}`);
    line(`  files    ${ink.white(String(info.attachments))}`);
    line(`  from     ${ink.white(new Date(info.exportedAt).toISOString())}`);
    line();
    line(ink.dim("Envelope looks intact. Import still needs the master password."));
  } catch (err) {
    line(ink.red(err instanceof Error ? err.message : "Invalid backup."));
  }
  await pause();
}

async function security(engine: VaultEngine): Promise<boolean> {
  const idx = await pickList("Security", ["Change master password", "Delete vault"]);
  if (idx === null) return false;
  if (idx === 0) {
    const current = await promptLine("Current master password: ", true);
    const next = requireMaster(await promptLine("New master password: ", true));
    const confirm = await promptLine("Confirm new password: ", true);
    if (next !== confirm) {
      line(ink.red("Passwords do not match."));
      await pause();
      return false;
    }
    try {
      await engine.changeMasterPassword(current, next);
      line(ink.white("Master password changed. Item ciphertext is the same; only the wrap changed."));
    } catch (err) {
      line(ink.red(err instanceof Error ? err.message : "Could not change password."));
    }
    await pause();
    return false;
  }
  line(ink.red("This deletes the vault on this database. Encrypted backups are not deleted."));
  line(ink.dim("There is no recovery."));
  const ack = (await promptLine("Type UNDERSTAND: ")).trim();
  if (ack !== "UNDERSTAND") return false;
  const password = await promptLine("Master password: ", true);
  try {
    await engine.wipe(password);
    line(ink.white("Vault deleted."));
    await pause();
    return true;
  } catch (err) {
    line(ink.red(err instanceof Error ? err.message : "Could not delete the vault."));
    await pause();
    return false;
  }
}

export async function runTui(dbPath: string): Promise<void> {
  process.on("exit", restoreTerminal);
  process.on("SIGINT", () => {
    restoreTerminal();
    process.exit(1);
  });
  const store = sqliteVaultStore(dbPath);
  const engine = new VaultEngine(store);
  try {
    await playBoot(`personal encrypted vault  ·  v${APP_VERSION}`);
    line(ink.dim(dbPath));
    line();
    for (;;) {
      setIdleLimit(-1);
      cancelClipboardWatch();
      if (engine.unlocked) engine.lock();
      const settings = loadSettings(engine, store);
      await unlockOrCreate(engine);
      setIdleLimit(settings.security.autoLockMs);
      try {
        const end = await home(engine);
        engine.lock();
        await playLock();
        if (end === "quit") break;
      } catch (err) {
        engine.lock();
        if (!(err instanceof IdleLock)) throw err;
        await playLock();
      }
      clear();
      printBanner();
      line();
      line(ink.dim("Locked. Enter the master password to continue."));
      line();
    }
  } finally {
    setIdleLimit(-1);
    cancelClipboardWatch();
    engine.lock();
    restoreTerminal();
  }
}
