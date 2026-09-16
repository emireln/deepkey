# Desktop

Local-first Electron app. Windows, macOS, Linux. Offline.

## Dev

```bash
pnpm install
pnpm --filter @deepkey/desktop dev
```

Renderer is Vite on port `5174`. Main process is compiled separately (`apps/desktop/scripts/dev.mjs`).

## Installers

```bash
pnpm --filter @deepkey/desktop pack
```

Targets are in `apps/desktop/electron-builder.yml` (NSIS, DMG, AppImage/deb).

## Where the vault is

OS application data, not next to the `.exe`:

- Windows: `%APPDATA%\DeepKey`
- macOS: `~/Library/Application Support/DeepKey`
- Linux: `~/.config/DeepKey`

SQLite lives under that folder (`vault/deepkey.sqlite` unless you pointed it somewhere else).

## Window

Custom titlebar. Traffic-light space on macOS, min / max / close on Windows and Linux.

Privacy mode can ask Electron to mark the window as protected from capture. That flag is OS-dependent. Do not bet your job on it.

Lock on blur / sleep / OS lock follows what you picked in settings.

## OS unlock

Optional. Windows and macOS can store the DEK with `safeStorage` (DPAPI / Keychain). The master password is not stored.

This is "I already logged into this OS account" unlock, not a second crypto design. If someone can use your logged-in user, they can use this too. Turn it off if that bothers you.

## Clipboard

Copy a secret, and DeepKey can clear the clipboard later **if** it still contains that secret. If you copied something else, it stays.

## Global shortcut

Optional. Ctrl/Cmd+Shift+K focuses the window and opens search. Registered with Electron `globalShortcut`. Turn it off if another app already owns that chord.

## Automatic backups

When enabled, the renderer exports an encrypted `.deepkeyvault` and the main process writes it under the backups folder. Ciphertext only. The master password is not in that file in the clear.

## Network

No telemetry. Vault features do not need the network.

The heart button in the sidebar opens the support page in the system browser (`https://buymeacoffee.com/emireln`). That is an explicit click. Main only allows `https://` URLs through `shell.openExternal`.

## One instance

A second launch focuses the existing window. Two processes sharing one SQLite file is how you corrupt a vault, so I locked it to one.
