import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { createServer } from "vite";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const vite = await createServer({
  configFile: path.join(desktop, "vite.config.ts"),
  root: desktop,
});
await vite.listen(5174);
const url = vite.resolvedUrls?.local[0] || "http://127.0.0.1:5174";

await import("./build-electron.mjs");

const child = spawn(electron, ["."], {
  cwd: desktop,
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
  stdio: "inherit",
});

child.on("exit", async (code) => {
  await vite.close();
  process.exit(code ?? 0);
});
