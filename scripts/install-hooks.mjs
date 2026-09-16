#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = path.join(root, ".git");
if (!fs.existsSync(gitDir)) process.exit(0);

const hooksDir = path.join(gitDir, "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

const srcDir = path.join(root, ".githooks");
for (const name of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, name);
  const dest = path.join(hooksDir, name);
  fs.copyFileSync(src, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* windows */
  }
}
