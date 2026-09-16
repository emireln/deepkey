# Working on DeepKey

This is the personal vault at [github.com/emireln/deepkey](https://github.com/emireln/deepkey). Desktop + self-hosted web. One user. Local encryption.

If you change code here, keep it boring and keep secrets off disk in plaintext.

## Layout

```
apps/desktop     Electron main, preload, renderer
apps/web         Vite React shell
apps/server      Hono API + static UI
packages/ui      Shared screens and styles
packages/vault-core
packages/crypto
packages/database
packages/env-parser
packages/types
packages/validation
packages/config
assets/logo.svg  Brand mark
docs/            How it is put together
```

`packages/vault-core` is the product. Create, unlock, lock, items, projects, environments, `.env` import/export, history, trash, backups, search, generator.

UI and crypto run in the renderer / browser. SQLite and the HTTP API store opaque envelopes. Do not decrypt on the server. Do not add a "plaintext cache" for convenience.

## Commands

Node 22+, pnpm.

```bash
pnpm install
pnpm --filter @deepkey/server dev
pnpm --filter @deepkey/web dev
pnpm --filter @deepkey/desktop dev
pnpm test
pnpm test:security
pnpm typecheck
```

Web: `http://localhost:5173` → `/api` proxied to `8787`.
Desktop renderer: Vite on `5174`.

`pnpm test:security` runs crypto + vault-core + server tests and `scripts/security-check.mjs` (no `eval`, no `innerHTML`, no `nodeIntegration: true`, no `contextIsolation: false`, no secret-looking `console.log`).

## Crypto rules

- Argon2id for the KEK. Floor is `m >= 19456`, `t >= 3`. Reject weaker params.
- XChaCha20-Poly1305 for records, attachments, and the wrapped DEK.
- Unique nonce per envelope. Fail closed on tamper.
- Associated data: `deepkey:dek:v1`, `deepkey:record:v1`, `deepkey:attachment:v1`.
- Master password is never stored, logged, or sent to the server.
- `wipe()` is the delete-vault path. Use it. Do not leave leftover ciphertext lying around if the user asked to destroy the vault.

Tests that hit Argon2 should pass `KDF_MIN` (or a test kdf). Do not call `calibrateKdf()` inside unit tests. It is slow on purpose.

## Desktop

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Preload is an IPC allowlist. Do not expose `fs`, `shell`, or `child_process` on `window`.
- New IPC needs the channel in `electron/preload.cjs` and `electron/main.ts`.
- `app:openExternal` only accepts `https://`.
- Custom titlebar. Do not bring back the native chrome unless you have a real reason.
- Clipboard clear only if the clipboard still matches what we copied.

## Web / server

- One instance user. Login password ≠ master password.
- HttpOnly, SameSite=Strict cookies. Secure when HTTPS.
- Origin check on mutations. When `DEEPKEY_PUBLIC_URL` is unset, localhost / 127.0.0.1 is allowed so Vite can proxy.
- Rate-limit login. Do not log bodies.
- CSP and the usual headers stay on.

## UI

- Dark charcoal. Geist / Inter for UI. The "deepkey" wordmark uses Horizon (Orbitron bundled locally if Horizon is not installed). Phosphor icons, not Lucide. Each sidebar item keeps its own icon color. Do not paint every active icon accent blue.
- UI copy is bold and 16px base. Don't shrink labels back to 13px.
- Primary buttons are white. Do not restyle the app into a generic dashboard.
- i18n lives in `packages/ui/src/i18n/en.ts` and `pt-BR.ts`. Add both when you add a string.
- Brand logo is `assets/logo.svg`. The in-app mark is the same paths in `packages/ui/src/components/Logo.tsx`. Change both or they drift.
- Favicon and desktop tray/app icons come from that mark (`assets/icon.png`, `assets/tray.png`).
- Logo shows in the sidebar, the desktop titlebar, and the lock screen. Do not put it on onboarding / first-run / web login setup.
- Support is a heart in the sidebar (and About). Hover turns the icon red (`#e24b4a`). It opens `https://buymeacoffee.com/emireln` through `platform.openExternal`. URL is `SUPPORT_URL` in `@deepkey/config`.

## Do not add

- Telemetry, analytics, crash reporters, ads, remote fonts from a CDN
- Team / org / invite / billing features
- Master-password recovery, hints stored as a backdoor, or "email me my vault"
- Cloud sync to someone else's servers
- `dangerouslySetInnerHTML` for user content

## Style of changes

Small diffs. Match the files around you. TypeScript strict. Zod on the boundary (IPC payloads, HTTP bodies).

If you add a feature, put it behind the existing vault engine when it is vault data. Do not invent a second store.

Docs are in `docs/` and the root README. Write them like a person who built the thing, not a brochure.

## Version

Root `package.json` is the source of truth. About reads `APP_VERSION` from `packages/config/src/index.ts`, which the bump script keeps in sync with every workspace `package.json`.

Every commit runs `.githooks/pre-commit` → `scripts/bump-version.mjs` (patch +1 on all workspace package.json files). `pnpm install` copies the hook via `scripts/install-hooks.mjs`. Skip with `SKIP_BUMP=1`.
