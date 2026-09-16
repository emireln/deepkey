# CLI

Local unlock, then print. Same vault engine as the apps. Nothing is decrypted on a server.

```bash
pnpm --filter @deepkey/cli start -- list
pnpm --filter @deepkey/cli start -- get OPENAI_API_KEY
pnpm --filter @deepkey/cli start -- env Personal Production
```

`--db` or `DEEPKEY_DB` if it should not guess the desktop/web sqlite path.

Password from `DEEPKEY_MASTER_PASSWORD`, or a prompt. Do not put the password on the command line.

Stdout is plaintext. Treat a redirected file like an exported `.env`.
