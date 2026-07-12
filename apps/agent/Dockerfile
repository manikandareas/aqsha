# syntax=docker/dockerfile:1
# Aqsha agent (Mastra runtime — Astra chat + deep-research workflow). Build context = repo ROOT.
# Deps install with Bun (bun.lock). Tools/steps read @aqsha/{db,services} via the `node`→dist
# export condition, so build:dist is required before `mastra build`.
FROM oven/bun:1.3.10 AS build
WORKDIR /app

# Manifests + lockfile FIRST so the install layer caches across source-only edits. Every workspace
# member must be present for `--frozen-lockfile` (keep in sync with root package.json `workspaces`).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

# `mastra build` bundles the server (Hono) into apps/agent/.mastra/output. Workspace deps are
# consumed from their dist builds (build:dist), so they don't need re-bundling from raw TS.
COPY . .
RUN bun run build:dist \
 && bun run --filter '@aqsha/agent' build

FROM node:24-slim AS runtime
WORKDIR /app/apps/agent
ENV NODE_ENV=production
ENV PORT=4317
ENV HOST=0.0.0.0
# Infisical CLI: the entrypoint `infisical run`s the app so runtime secrets come from Infisical /app.
# Above the commit-changing ENV below so it stays cached. Debian base → official apt repo.
# pipefail: a failed setup-script download (curl -f) fails the build instead of being masked by bash.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
 && apt-get install -y --no-install-recommends infisical \
 && rm -rf /var/lib/apt/lists/*
# Release tag (commit SHA) baked in → Sentry `release` + Langfuse `GIT_COMMIT` (both read at runtime).
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    SENTRY_RELEASE=$GIT_COMMIT
COPY --from=build /app /app
# Wrap the Mastra server with Infisical secret injection (execs CMD directly if no INFISICAL_* set).
COPY infra/infisical-entrypoint.sh /usr/local/bin/aqsha-entrypoint
RUN chmod +x /usr/local/bin/aqsha-entrypoint
ENTRYPOINT ["/usr/local/bin/aqsha-entrypoint"]
EXPOSE 4317
# Mastra build output = a self-contained Node server. It reads PORT/HOST from env (see
# src/mastra/index.ts) and binds 0.0.0.0 so the web container's `http://agent:4317/mastra-api/*`
# proxy reaches it. Runtime state (threads/messages/workflow snapshots) lives in Postgres
# (mastra_* tables) — no file-backed durable volume needed.
CMD ["node", "/app/apps/agent/.mastra/output/index.mjs"]
