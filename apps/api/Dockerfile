# syntax=docker/dockerfile:1
# Aqsha API (Elysia) + BullMQ worker — runs under Bun. Build context = repo ROOT.
# The compose `worker` service reuses this image with command override `bun run start:worker`.
FROM oven/bun:1.3.10
WORKDIR /app
ENV NODE_ENV=production

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
COPY packages/ui/package.json packages/ui/package.json
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

EXPOSE 3001
# ponytail: api/worker run under Bun. Override CMD to start:worker for the worker service.
CMD ["bun", "run", "start:api"]
