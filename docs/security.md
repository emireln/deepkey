# Security

DeepKey is a personal vault. The goal is: if someone copies the database or the backup, they still need the master password.

## Keys

| Key | Role | Lifetime |
| --- | --- | --- |
| Master password | Human secret. Never stored, logged, or sent to the server. | In memory while typing / deriving |
| KEK | Argon2id(master, salt, params) | Dropped after wrap / unwrap |
| DEK | 256-bit random | In memory while unlocked; wrapped at rest |
| OS unlock blob | `safeStorage(DEK)` | Optional, desktop only |

There is no recovery key I hold. I cannot unlock your vault.

## Authenticated encryption

Every record gets its own nonce. If ciphertext, nonce, or associated data is changed, decrypt fails and the app treats it as bad data.

KDF params below the floor (`m < 19456` or `t < 3`) are rejected. Old vaults cannot silently become weaker.

Changing the master password re-wraps the DEK. Item ciphertext stays. That is on purpose: re-encrypting the whole vault on a password change is slow and easy to get wrong.

## Web

- Argon2id hash for the instance login
- HttpOnly, SameSite=Strict cookies; Secure when the request is HTTPS
- Origin check on mutations
- Rate-limited login
- CSP, `X-Content-Type-Options`, `Referrer-Policy`, no framing
- Database holds encrypted vault payloads
- Record / attachment IDs and pref keys go through the same opaque-id rules as desktop IPC
- Pref values capped (1 MB), same as desktop
- `openExternal` in the browser only follows `https://`
- No secrets in URLs
- Logger redacts secret-looking keys

The server can see that you logged in. It cannot read vault items.

## Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- IPC allowlist in preload and main
- Zod on vault payloads
- Navigation to random origins denied
- External links only `https://` via `shell.openExternal`
- Single-instance lock so two processes do not share one vault file
- Wipe deletes records, attachments, header, prefs KV, and the OS-unlock blob

## CLI

Unlocks the same sqlite file locally. It does not talk to the HTTP API.

It honors the GUI security settings when that `settings` row exists: auto-lock after idle (next key locks), clipboard timeout with clear-if-unchanged, and re-prompting the master password before a plaintext `.env` or encrypted backup export if that toggle is on.

Wipe and backup import/export go through `vault-core`, same as the apps. `get` / `env` print plaintext on purpose.

## Clipboard

Desktop can clear the clipboard after a timeout, but only if the current clipboard still matches what DeepKey put there. If you copied something else in between, it is left alone.

The web app does not claim clipboard clearing. Browsers do not give you a reliable way to do that.

## Privacy mode

Hides values in the UI and, on desktop, asks Electron for content protection. Best effort. A determined screen capture still exists in the real world.

## Logging

`redact()` in `@deepkey/config` strips secret-looking keys. Do not log payloads, passwords, tokens, or keys. `scripts/security-check.mjs` fails the build if it sees the obvious mistakes.

## What I do not claim

- Zero-knowledge for the web **login** password (the server has to hash it).
- Perfect memory wipe in JavaScript.
- Impossible screen capture.
- Protection of an unlocked OS session.
- Safety if you export a plaintext `.env` and then commit it.

## If you self-host

Put TLS in front. Set `DEEPKEY_PUBLIC_URL`. Leave `DEEPKEY_TRUST_PROXY` false unless the proxy is yours. Do not expose `8787` to the internet as raw HTTP unless you like session cookies on a bus.
