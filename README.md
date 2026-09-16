# DeepKey

<img src="assets/banner.svg" alt="deepkey" height="64">

Personal encrypted vault. I keep `.env` files, API keys, tokens, passwords, SSH keys, certificates, notes, and small files in it.

This is for one person. No teams, no sharing, no SaaS.

Source: [github.com/emireln/deepkey](https://github.com/emireln/deepkey)

## Two ways to run it

**Desktop** — Electron, Windows / macOS / Linux. SQLite on disk. Works offline.

**Self-hosted web** — Docker or Node. SQLite by default. You host it. Nothing goes to a third-party cloud.

Same UI, same data model, same encryption on both.

## How encryption works

I do not encrypt the whole SQLite file and call it done.

- A random 256-bit data key (DEK) encrypts every record and attachment with XChaCha20-Poly1305 (`@noble/ciphers`).
- The master password never leaves the app. Argon2id (`@noble/hashes`) stretches it into a wrapping key (KEK).
- The KEK wraps the DEK. Changing the master password re-wraps the DEK. It does not re-encrypt every item.
- Names, notes, tags, values, and file bytes sit inside authenticated ciphertext. Opaque IDs and timestamps can stay in the clear so the app can list things.
- Search runs in memory after unlock. There is no plaintext search index of secret values on disk or on the server.

On the web app there is a second password: the login password. That one is hashed on the server (Argon2id) and only protects the HTTP session. The master password still encrypts the vault in the browser and is never stored on the server.

JavaScript cannot promise that keys are gone from RAM. Locking drops references and overwrites `Uint8Array` key bytes as a best effort. An unlocked session on a machine you do not control is not safe.

## What it is meant to stop

- stolen SQLite database
- stolen `.deepkeyvault` backup
- lost laptop while the vault is locked
- someone reading the self-hosted server disk
- accidental plaintext export
- XSS / CSRF / brute-force login / wild Electron IPC / secrets in logs

What it is not meant to stop: an attacker who already owns an unlocked OS or an unlocked DeepKey session.

Privacy mode / screen-capture reduction is best effort. It is not magic.

There is no master-password recovery. If you forget it, the vault stays closed.

## Where data lives

| Mode | Location |
| --- | --- |
| Desktop | OS app data, not the install folder. `%APPDATA%\DeepKey` on Windows, `~/Library/Application Support/DeepKey` on macOS, `~/.config/DeepKey` on Linux. |
| Web / Docker | `DEEPKEY_DATA_DIR` (`/data` in Docker, `./data` in dev). File: `deepkey.sqlite`. |

## Backup

Settings → Backup → Export encrypted backup. That writes a `.deepkeyvault` file: vault header, encrypted records, encrypted attachments.

Import is transactional. If it fails, the current vault is left alone.

Plaintext `.env` export is a different action. The app warns you. Treat that file as a secret. Do not commit it.

More in [docs/backup.md](docs/backup.md).

## Forgotten master password

Unrecoverable. I say that during setup on purpose. Keep an encrypted backup somewhere you control, and remember the password.

## Quick start — self-hosted web

```bash
docker compose up -d
```

Open `http://127.0.0.1:8787`.

1. Create the instance login (auth password).
2. Create the vault (master password).

Those are two different passwords on purpose.

In production put HTTPS in front (Caddy, nginx, Traefik) and set `DEEPKEY_PUBLIC_URL` to the public origin.

Details: [docs/self-host.md](docs/self-host.md)

## Quick start — development

Node 22+ and pnpm.

```bash
pnpm install
pnpm --filter @deepkey/server dev
pnpm --filter @deepkey/web dev
```

Web UI: `http://localhost:5173` (proxies `/api` to the server on `8787`).

## Desktop

```bash
pnpm install
pnpm --filter @deepkey/desktop dev
```

Installers:

```bash
pnpm --filter @deepkey/desktop pack
```

Windows NSIS, macOS DMG, Linux AppImage/deb. Config is in `apps/desktop/electron-builder.yml`.

On Windows/macOS, optional OS unlock stores the DEK (never the master password) with Electron `safeStorage` (DPAPI / Keychain). That is only as strong as the OS user login.

Details: [docs/desktop.md](docs/desktop.md)

## CLI

Unlock the local sqlite vault on this machine and print. Same engine as the apps.

```bash
pnpm --filter @deepkey/cli start -- env Personal Production
pnpm --filter @deepkey/cli start -- get OPENAI_API_KEY
```

Password from `DEEPKEY_MASTER_PASSWORD` or a prompt. Details: [docs/cli.md](docs/cli.md)

## Tests

```bash
pnpm test
pnpm test:security
```

## Network

Desktop does not phone home. No telemetry, no analytics, no ads, no remote fonts. Vault features work with the network unplugged.

The web app only talks to the DeepKey server you run.

The heart button in the sidebar opens [buymeacoffee.com/emireln](https://buymeacoffee.com/emireln). That is the only outbound link I put in the UI.

## Docs

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Backup](docs/backup.md)
- [CLI](docs/cli.md)
- [Self-host](docs/self-host.md)
- [Desktop](docs/desktop.md)
- [Notes for contributors / agents](AGENTS.md)

## License

MIT. See [LICENSE](LICENSE).
