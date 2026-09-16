import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { sqliteVaultStore } from "@deepkey/database";
import { itemSecret, VaultEngine } from "@deepkey/vault-core";
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

function defaultDb(): string {
  if (process.env.DEEPKEY_DB) return process.env.DEEPKEY_DB;
  if (process.env.DEEPKEY_DATA_DIR) return path.join(process.env.DEEPKEY_DATA_DIR, "deepkey.sqlite");
  const home = os.homedir();
  const candidates = [
    path.join(home, "AppData", "Roaming", "DeepKey", "vault", "deepkey.sqlite"),
    path.join(home, "Library", "Application Support", "DeepKey", "vault", "deepkey.sqlite"),
    path.join(home, ".config", "DeepKey", "vault", "deepkey.sqlite"),
    path.join(process.cwd(), "data-dev", "deepkey.sqlite"),
    path.join(process.cwd(), "data", "deepkey.sqlite"),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0]!;
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

function usage(): string {
  return `deepkey — local encrypted vault

Interactive (TTY):
  deepkey
  deepkey [--db path] tui

One-shot (stdout is plaintext):
  deepkey [--db path] list
  deepkey [--db path] get <name>
  deepkey [--db path] env <project> [environment]

Password: DEEPKEY_MASTER_PASSWORD, or a prompt.
Database: --db, DEEPKEY_DB, DEEPKEY_DATA_DIR, or the usual desktop/web paths.

Banner: apps/cli/cli.txt on this machine (not in git).
Decrypts on this machine. Do not pipe secrets into a log.
`;
}

async function runScript(dbPath: string, command: string, rest: string[]): Promise<void> {
  if (!fs.existsSync(dbPath)) fail(`No vault database at ${dbPath}.`);
  const engine = new VaultEngine(sqliteVaultStore(dbPath));
  if (!(await engine.hasVault())) fail("No vault in that database.");
  try {
    await engine.unlock(await promptPassword());
  } catch (err) {
    fail(err instanceof Error ? err.message : "Could not unlock.");
  }
  try {
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
      stdout.write(engine.exportEnv(project.id, env.id));
      return;
    }
    fail(usage(), 2);
  } finally {
    engine.lock();
  }
}

async function main(): Promise<void> {
  const { db, command, rest } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "-h" || command === "--help") {
    stdout.write(usage());
    return;
  }
  const dbPath = db ?? defaultDb();
  if (command === "tui" || command === "open" || command === "ui") {
    if (!stdin.isTTY || !stdout.isTTY) fail("Interactive mode needs a terminal.");
    await runTui(dbPath);
    return;
  }
  await runScript(dbPath, command, rest);
}

main().catch((err) => fail(err instanceof Error ? err.message : "Failed."));
