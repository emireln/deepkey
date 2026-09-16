# CLI

Same vault engine as the apps. Nothing is decrypted on a server.

On a terminal, `deepkey` opens the interactive UI: banner from `apps/cli/cli.txt`, unlock (or create a vault), then overview, vault, projects, `.env` import/export/diff, generator, search, trash, backup.

`cli.txt` stays on your machine. It is gitignored. If it is missing, the CLI uses a built-in copy of the same mark.

```bash
pnpm --filter @deepkey/cli start
```

Scripting still works. Stdout is plaintext. Treat a redirected file like an exported `.env`.

```bash
pnpm --filter @deepkey/cli start -- list
pnpm --filter @deepkey/cli start -- get OPENAI_API_KEY
pnpm --filter @deepkey/cli start -- env Personal Production
```

`--db` or `DEEPKEY_DB` if it should not guess the desktop/web sqlite path.

Password from `DEEPKEY_MASTER_PASSWORD`, or a prompt. Do not put the password on the command line.

`NO_ANIM=1` or `CI=1` skips the boot/lock animations. `NO_COLOR=1` skips color.
