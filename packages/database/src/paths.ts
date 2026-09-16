import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Same sqlite file the desktop app and the self-hosted web instance use, when they share this machine. */
export function resolveLocalVaultDb(
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
  cwd = process.cwd(),
): string {
  if (env.DEEPKEY_DB) return path.resolve(env.DEEPKEY_DB);
  if (env.DEEPKEY_DATA_DIR) return path.resolve(env.DEEPKEY_DATA_DIR, "deepkey.sqlite");
  const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
  const xdg = env.XDG_CONFIG_HOME || path.join(home, ".config");
  const candidates = [
    path.join(appData, "DeepKey", "vault", "deepkey.sqlite"),
    path.join(home, "Library", "Application Support", "DeepKey", "vault", "deepkey.sqlite"),
    path.join(xdg, "DeepKey", "vault", "deepkey.sqlite"),
    path.join(cwd, "data-dev", "deepkey.sqlite"),
    path.join(cwd, "data", "deepkey.sqlite"),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0]!;
}
