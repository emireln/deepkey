FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @deepkey/web build && pnpm --filter @deepkey/server build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps /app/apps
COPY --from=build /app/packages /app/packages
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
# The vault lives in /data. Keep it owned by the unprivileged user that runs the server.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production
ENV DEEPKEY_DATA_DIR=/data
ENV DEEPKEY_HOST=0.0.0.0
ENV DEEPKEY_PORT=8787
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
