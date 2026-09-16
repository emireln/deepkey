import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const banned = [
  /dangerouslySetInnerHTML/,
  /\beval\s*\(/,
  /\.innerHTML\s*=/,
  /nodeIntegration:\s*true/,
  /contextIsolation:\s*false/,
  /console\.log\([^)]*(secret|password|token|dek|kek)/i,
];

const skip = /node_modules|dist|dist-electron|release|playwright-report|coverage/;
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip.test(full)) continue;
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) files.push(full);
  }
}

walk(root);
let failed = false;
for (const file of files) {
  if (file.endsWith("security-check.mjs")) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const re of banned) {
    if (re.test(text)) {
      console.error(`Pattern ${re} in ${path.relative(root, file)}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`Scanned ${files.length} files. No banned patterns.`);
