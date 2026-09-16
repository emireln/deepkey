# Self-host

Run DeepKey on a machine you control. Docker is the easy path.

## Docker

From the repo root:

```bash
docker compose up -d
```

App: `http://127.0.0.1:8787`

Data lives in the `deepkey-data` volume (`/data` in the container). SQLite file: `deepkey.sqlite`.

First visit:

1. Create the instance user (login password).
2. Create the vault (master password).

Do not reuse the same string for both. The login password is hashed on the server. The master password never should be.

## Environment

Copy `.env.example` if you run without Compose, or set these on the service:

| Variable | What it does |
| --- | --- |
| `DEEPKEY_DATA_DIR` | Where SQLite lives. `/data` in Docker. |
| `DEEPKEY_HOST` | Bind address. `0.0.0.0` in Docker. |
| `DEEPKEY_PORT` | Default `8787`. |
| `DEEPKEY_PUBLIC_URL` | Public origin, e.g. `https://deepkey.example.com`. Set this behind HTTPS. |
| `DEEPKEY_TRUST_PROXY` | Trust `X-Forwarded-*` only if the reverse proxy is yours. Default `false`. |

## HTTPS

Do not put this on the public internet as plain HTTP.

Caddy / nginx / Traefik in front, TLS there, proxy to `8787`. Set `DEEPKEY_PUBLIC_URL` to that origin so the origin check matches what the browser sends.

## Dev without Docker

```bash
pnpm install
pnpm --filter @deepkey/server dev
pnpm --filter @deepkey/web dev
```

UI: `http://localhost:5173`

The Vite dev server proxies `/api` and `/health` to `8787`. If origin checks fail, you are probably hitting `127.0.0.1` vs `localhost` in a way the server did not expect. Use `localhost` in dev, or set `DEEPKEY_PUBLIC_URL`.

## Updates

Rebuild the image from this repo and bring Compose back up. Back up a `.deepkeyvault` first if the data matters.

I do not ship an auto-updater for the web image.

## What the server is not

It is not a multi-user product. One login. One vault. If you need a team password manager, this is the wrong repo.
