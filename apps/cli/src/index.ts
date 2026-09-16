import fs from "node:fs";
import { stdin, stdout } from "node:process";
import { resolveLocalVaultDb, sqliteVaultStore } from "@deepkey/database";
import { mergeAppSettings } from "@deepkey/types";
import { inspectBackup, itemSecret, VaultEngine } from "@deepkey/vault-core";
import { runTui } from "./tui.js";

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv: string[]): { db?: string; command: string; rest: string[] } {
  const rest: string[] = [];
  let db: string | undefined;
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--db" && argv[i + 1]) {
      db = argv[i + 1];
      i += 2;
      continue;
    }
    if (arg.startsWith("--db=")) {
      db = arg.slice(5);
      i += 1;
      continue;
    }
    rest.push(arg);
    i += 1;
  }
  const interactive = Boolean(stdin.isTTY && stdout.isTTY);
  const command = rest.shift() ?? (interactive ? "tui" : "help");
  return { db, command, rest };
}

async function promptPassword(): Promise<string> {
  if (process.env.DEEPKEY_MASTER_PASSWORD) return process.env.DEEPKEY_MASTER_PASSWORD;
  if (!stdin.isTTY) fail("Set DEEPKEY_MASTER_PASSWORD or run this in a terminal.");
  stdout.write("Master password: ");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (chunk === "\r" || chunk === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (chunk === "\u007f" || chunk === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += chunk;
    };
    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    }
    stdin.on("data", onData);
  });
}

function pickOne<T extends { name: string }>(items: T[], name: string, label: string): T {
  const needle = name.toLowerCase();
  const hits = items.filter((item) => item.name.toLowerCase() === needle);
  if (hits.length === 1) return hits[0]!;
  const fuzzy = items.filter((item) => item.name.toLowerCase().includes(needle));
  if (fuzzy.length === 1) return fuzzy[0]!;
  if (!hits.length && !fuzzy.length) fail(`No ${label} named "${name}".`);
  fail(`Ambiguous ${label} "${name}".`);
}

function readJsonFile(file: string, maxBytes: number): unknown {
  if (!file || file.includes("\0")) fail("Invalid path.");
  const stat = fs.statSync(file);
  if (stat.size > maxBytes) fail("File is too large.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function usage(): string {
  return `deepkey — local encrypted vault

Interactive (TTY):
  deepkey
  deepkey [--db path] tui

One-shot (stdout is plaintext for get/env):
  deepkey [--db path] list
  deepkey [--db path] get <name>
  deepkey [--db path] env <project> [environment]
  deepkey [--db path] backup-export <file>
  deepkey [--db path] backup-import <file>
  deepkey [--db path] backup-verify <file>

Password: DEEPKEY_MASTER_PASSWORD, or a prompt.
Database: --db, DEEPKEY_DB, DEEPKEY_DATA_DIR, or the usual desktop/web paths.

Banner: apps/cli/cli.txt on this machine (not in git).
Decrypts on this machine. Do not pipe secrets into a log.
`;
}

async function unlockEngine(engine: VaultEngine): Promise<void> {
  if (!(await engine.hasVault())) fail("No vault in that database.");
  try {
    await engine.unlock(await promptPassword());
  } catch (err) {
    fail(err instanceof Error ? err.message : "Could not unlock.");
  }
}

async function runScript(dbPath: string, command: string, rest: string[]): Promise<void> {
  if (command === "backup-verify") {
    const file = rest[0];
    if (!file) fail("Usage: deepkey backup-verify <file>");
    try {
      const info = inspectBackup(readJsonFile(file, 50 * 1024 * 1024));
      stdout.write(`${info.displayName}\t${info.records} records\t${info.attachments} files\n`);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Invalid backup.");
    }
    return;
  }

  if (!fs.existsSync(dbPath) && command !== "backup-import") fail(`No vault database at ${dbPath}.`);
  const store = sqliteVaultStore(dbPath);
  const engine = new VaultEngine(store);
  try {
    try {
      const raw = store.getKv("settings");
      if (raw) engine.applySettings(mergeAppSettings(JSON.parse(raw)));
    } catch {
      /* defaults */
    }

    if (command === "backup-import") {
      const file = rest[0];
      if (!file) fail("Usage: deepkey backup-import <file>");
      if (await engine.hasVault()) await unlockEngine(engine);
      await engine.importBackup(readJsonFile(file, 50 * 1024 * 1024));
      stdout.write("Imported. Unlock with the backup's master password.\n");
      return;
    }

    await unlockEngine(engine);

    if (command === "list") {
      for (const item of engine.items().sort((a, b) => a.name.localeCompare(b.name))) {
        stdout.write(`${item.name}\n`);
      }
      return;
    }
    if (command === "get") {
      const name = rest[0];
      if (!name) fail("Usage: deepkey get <name>");
      const item = pickOne(engine.items(), name, "item");
      const secret = itemSecret(item);
      if (!secret) fail(`"${item.name}" has no copyable secret.`);
      stdout.write(secret.endsWith("\n") ? secret : `${secret}\n`);
      return;
    }
    if (command === "env") {
      const projectName = rest[0];
      if (!projectName) fail("Usage: deepkey env <project> [environment]");
      const project = pickOne(engine.projects(), projectName, "project");
      const envs = engine.environments(project.id);
      const env = rest[1] ? pickOne(envs, rest[1], "environment") : envs[0];
      if (!env) fail("That project has no environments.");
      if (stderrTty()) process.stderr.write("Plaintext secrets on stdout.\n");
      stdout.write(engine.exportEnv(project.id, env.id));
      return;
    }
    if (command === "backup-export") {
      const dest = rest[0];
      if (!dest) fail("Usage: deepkey backup-export <file>");
      if (dest.includes("\0")) fail("Invalid path.");
      const payload = await engine.exportBackup();
      fs.writeFileSync(dest, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
      stdout.write(`Encrypted backup written to ${dest}\n`);
      return;
    }
    fail(usage(), 2);
  } finally {
    engine.lock();
  }
}

function stderrTty(): boolean {
  return Boolean(process.stderr.isTTY);
}

async function main(): Promise<void> {
  const { db, command, rest } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "-h" || command === "--help") {
    stdout.write(usage());
    return;
  }
  const dbPath = db ?? resolveLocalVaultDb();
  if (command === "tui" || command === "open" || command === "ui") {
    if (!stdin.isTTY || !stdout.isTTY) fail("Interactive mode needs a terminal.");
    await runTui(dbPath);
    return;
  }
  await runScript(dbPath, command, rest);
}

main().catch((err) => fail(err instanceof Error ? err.message : "Failed."));
