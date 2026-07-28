# syntax=docker/dockerfile:1
# Aqsha API (Elysia) + BullMQ worker — runs under Bun. Build context = repo ROOT.
# The compose `worker` service reuses this image with command override `bun run start:worker`.
FROM oven/bun:1.3.10
WORKDIR /app
ENV NODE_ENV=production

# Infisical CLI: baked in so the entrypoint can `infisical run` (inject /app secrets at start). Placed
# above the dependency install so it caches across source/package edits. Debian base → official apt repo.
# PINNED to 0.43.98 — the LAST CLI that fetches secrets via API v3; 0.43.99+ calls /api/v4/secrets,
# which our self-hosted Infisical server doesn't serve (route 404 → every container crash-loops).
# Bump only together with (or after) a server upgrade that adds the v4 routes.
# pipefail: a failed setup-script download (curl -f) fails the build instead of being masked by bash.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
 && apt-get install -y --no-install-recommends infisical=0.43.98 \
 && rm -rf /var/lib/apt/lists/*

# Manifests + lockfile FIRST so the (slow) `bun install` layer is cached until a package.json or
# bun.lock changes — a plain source edit no longer busts install. `--frozen-lockfile` needs every
# workspace member present, so copy all of them (keep in sync with root package.json `workspaces`).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json
RUN bun install --frozen-lockfile

# Source last (.dockerignore strips node_modules/.next/dist/.eve/.workflow-data). build:dist emits
# @aqsha/{db,services} dist for parity (api/worker still read src via the `bun` export condition).
COPY . .
RUN bun run build:dist

# Release tag (commit SHA) baked in LAST → changing the commit only busts this tiny ENV layer, not the
# (slow) install/build layers above. Sentry `release` + Langfuse `GIT_COMMIT`. Set by CI build-arg;
# `unknown` for hand builds. Kept out of compose env so it isn't clobbered at runtime.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    SENTRY_RELEASE=$GIT_COMMIT

# Wrap the process with Infisical secret injection (see the script). With no INFISICAL_* machine
# identity present it execs the CMD directly, so local `compose.build.yaml` builds still run.
COPY infra/infisical-entrypoint.sh /usr/local/bin/aqsha-entrypoint
RUN chmod +x /usr/local/bin/aqsha-entrypoint
ENTRYPOINT ["/usr/local/bin/aqsha-entrypoint"]

EXPOSE 3001
# ponytail: api/worker run under Bun. Override CMD to start:worker for the worker service.
CMD ["bun", "run", "start:api"]
