#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.SKIP_BUMP === "1") {
  process.exit(0);
}

if (fs.existsSync(path.join(root, ".git", "MERGE_HEAD"))) {
  process.exit(0);
}

const rootPkgPath = path.join(root, "package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
const [major, minor, patch] = String(rootPkg.version).split(".").map((n) => Number(n));
if (![major, minor, patch].every((n) => Number.isInteger(n))) {
  console.error("Could not parse version from package.json");
  process.exit(1);
}
const next = `${major}.${minor}.${patch + 1}`;

function bumpFile(file) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = next;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

bumpFile(rootPkgPath);
for (const dir of ["apps", "packages"]) {
  const base = path.join(root, dir);
  for (const name of fs.readdirSync(base)) {
    const file = path.join(base, name, "package.json");
    if (fs.existsSync(file)) bumpFile(file);
  }
}

console.log(`Version ${rootPkg.version} -> ${next}`);
