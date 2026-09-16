# Architecture

pnpm monorepo. Two apps on top of the same core.

```
apps/desktop    Electron main + preload + renderer
apps/web        Vite React shell
apps/server     Self-hosted Hono/Node API + static UI
packages/ui     Shared interface
packages/vault-core
packages/crypto
packages/database
packages/env-parser
packages/types
packages/validation
packages/config
assets/logo.svg
```

## Why it is split this way

I wanted one vault engine, not two products that drift.

`packages/vault-core` owns behavior: create / unlock / lock, items, projects, environments, `.env` import/export, history, trash, backups, search, generator.

`packages/crypto` is only keys and envelopes. `packages/database` is only SQLite. The UI never talks SQL. The server never sees plaintext records.

Platform adapters (`apps/web/src/platform.ts`, `apps/desktop/src/main.tsx`) fill in storage, clipboard, files, window, and `openExternal`. The React tree is shared.

## Encrypt, then store

Encryption happens in the renderer or the browser, before anything is written.

What hits disk or the API:

- vault header (wrapped DEK + Argon2id params + display name)
- `StoredRecord` rows (ciphertext + nonce + aad)
- `StoredAttachment` rows (same idea, file bytes)

What does not:

- master password
- KEK
- DEK (except optionally wrapped by OS `safeStorage` on desktop, and only while the user turned OS unlock on)

## Desktop process split

- **Main:** SQLite (`better-sqlite3`), native dialogs, clipboard, window state, `safeStorage`, power events, tray.
- **Preload:** explicit IPC allowlist. Nothing else on `window.deepkey`.
- **Renderer:** sandboxed, `contextIsolation`, no Node.

Main validates payloads with Zod before they touch SQLite.

## Web split

- Browser holds the DEK while unlocked and encrypts records.
- Server authenticates one user with Argon2id, sets an HttpOnly session cookie, and stores ciphertext.
- Vite in dev proxies `/api` and `/health` from `5173` to `8787`.

The login password and the vault password are not the same thing. Mixing them would mean the server could unwrap the vault. I did not want that.

## Crypto format

Independent from the SQL schema version.

- `cryptoVersion`: 1
- AEAD: XChaCha20-Poly1305, 24-byte random nonce per envelope
- KDF: Argon2id, versioned parameters, calibrated at vault creation, with a floor (`KDF_MIN` / `KDF_FLOOR` in `@deepkey/config`)

Associated data keeps DEK wraps, records, and attachments from being swapped into each other.

## Data model (short)

- One vault per install / instance.
- Projects and environments group items.
- Item types: api key, token, credential, env var, database, ssh key, certificate, webhook, note, file, custom.
- `.env` files are first-class: parse, import with skip/keep/create, export, raw editor.
- Trash is soft delete until retention or empty.
- History is a capped list of previous ciphertext versions, not a git repo.

## Search

Unlock, decrypt into memory, filter there. Ctrl/Cmd+K is the command palette.

I did not build a server-side plaintext index. That would undo the point.

## i18n

English and pt-BR in `packages/ui/src/i18n`. Switching locale is a setting, not a URL.

## Brand

Logo file: `assets/logo.svg`. In-app mark: `packages/ui/src/components/Logo.tsx` (same paths).

Shown in the sidebar, desktop titlebar, lock screen. Not on onboarding.
