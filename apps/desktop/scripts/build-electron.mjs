import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(root, "..");

await build({
  entryPoints: [path.join(desktop, "electron/main.ts")],
  outfile: path.join(desktop, "dist-electron/main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron", "better-sqlite3"],
  sourcemap: true,
});

mkdirSync(path.join(desktop, "dist-electron"), { recursive: true });
cpSync(path.join(desktop, "electron/preload.cjs"), path.join(desktop, "dist-electron/preload.cjs"));
