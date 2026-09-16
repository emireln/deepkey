# CLI

Same vault engine and the same sqlite file as the apps. Nothing is decrypted on a server.

On a terminal, `deepkey` opens the interactive UI: banner from `apps/cli/cli.txt`, unlock (or create a vault), then overview, vault, projects, `.env` import/export/diff, generator, search, trash, encrypted backup, change master password, wipe.

`cli.txt` stays on your machine. It is gitignored. If it is missing, the CLI uses a built-in copy of the same mark.

It guesses the database in this order: `--db`, `DEEPKEY_DB`, `DEEPKEY_DATA_DIR/deepkey.sqlite`, the desktop app path, then `./data-dev` / `./data`. That is the same helper the rest of the repo uses (`resolveLocalVaultDb`).

Settings you saved in the desktop or web UI live in that database (`settings` in KV). The CLI applies them: auto-lock, clipboard timeout, history/trash/attachment limits, and "require password for export".

```bash
pnpm --filter @deepkey/cli start
```

Scripting still works. `get` and `env` print plaintext. Treat a redirected file like an exported `.env`.

```bash
pnpm --filter @deepkey/cli start -- list
pnpm --filter @deepkey/cli start -- get OPENAI_API_KEY
pnpm --filter @deepkey/cli start -- env Personal Production
pnpm --filter @deepkey/cli start -- backup-export vault.deepkeyvault
pnpm --filter @deepkey/cli start -- backup-verify vault.deepkeyvault
pnpm --filter @deepkey/cli start -- backup-import vault.deepkeyvault
```

`--db` or `DEEPKEY_DB` if it should not guess the desktop/web sqlite path.

Password from `DEEPKEY_MASTER_PASSWORD`, or a prompt. Do not put the password on the command line.

`NO_ANIM=1` or `CI=1` skips the boot/lock animations. `NO_COLOR=1` skips color.

Backup import replaces the vault and locks. Unlock with that backup's master password, same as the apps.
