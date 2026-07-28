# syntax=docker/dockerfile:1
# Aqsha web (SvelteKit, adapter-node). Build context = repo ROOT.
# App config is read at RUNTIME via $env/dynamic/* (Infisical /app through the entrypoint) — the
# only build-time inputs are the SEO prerender bake (PUBLIC_SITE_URL / PUBLIC_SEO_ALLOW_INDEXING)
# and the optional Sentry source-map upload.
FROM oven/bun:1.3.10 AS build
WORKDIR /app

# oven/bun ships with an EMPTY system trust store — sentry-cli (native binary, system trust store)
# fails every TLS call without ca-certificates (same reason as the other images).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ARG GIT_COMMIT=unknown
ARG CI
# Baked into prerendered marketing pages (canonical/OG/JSON-LD + meta robots in SeoHead). Per-env
# values come from Infisical /build via deploy.yml; defaults keep hand-built images pointing at the
# prod origin with indexing OFF (preview-safe).
ARG PUBLIC_SITE_URL=https://aqshara.com
ARG PUBLIC_SEO_ALLOW_INDEXING=false
# Sentry source-map upload config. vite.config.ts reads plain SENTRY_ORG/SENTRY_PROJECT, while the
# Infisical /build key (and deploy.yml build-arg) is named SENTRY_PROJECT_WEB → mapped in ENV below.
# All optional: no auth token → upload skipped, build still succeeds.
ARG SENTRY_ORG
ARG SENTRY_PROJECT_WEB

# Manifests + lockfile first → `bun install` layer cached across source-only edits (all workspace
# members required for --frozen-lockfile; keep in sync with root package.json `workspaces`).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/www/package.json apps/www/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui-svelte/package.json packages/ui-svelte/package.json
RUN bun install --frozen-lockfile

# Build-time env set AFTER install so a commit bump doesn't bust the dependency layer.
# The pk_/sk_/URL placeholders only satisfy the fail-fast zod validation ($lib/server/env) that runs
# during SvelteKit's postbuild analyse — real values arrive at runtime via Infisical. They can't leak
# into shipped HTML: prerendered marketing pages never touch Clerk or the API client.
# SENTRY_RELEASE tags the source-map upload and must equal the runtime release (runtime stage below).
ENV CI=$CI \
    PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder \
    CLERK_SECRET_KEY=sk_test_placeholder \
    PUBLIC_API_URL=http://localhost:3001 \
    MASTRA_AGENT_ORIGIN=http://localhost:4111 \
    PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_SEO_ALLOW_INDEXING=$PUBLIC_SEO_ALLOW_INDEXING \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT_WEB \
    SENTRY_RELEASE=$GIT_COMMIT

COPY . .
# SENTRY_AUTH_TOKEN via secret mount (never lands in a layer): present → sentrySvelteKit uploads
# then deletes source maps; absent → upload disabled, build still succeeds. Web imports workspace
# deps as raw TS/Svelte source (@aqsha/api/client, @aqsha/chat-core, @aqsha/ui-svelte), so no
# build:dist step is needed here.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    bun run --filter '@aqsha/web' build

FROM node:24-slim AS runtime
WORKDIR /app/apps/web
ENV NODE_ENV=production
# adapter-node reads PORT/HOST/ORIGIN from env. ORIGIN is per-env (staging vs prod) → set it in
# compose/Dokploy, not baked here.
ENV PORT=3000
ENV HOST=0.0.0.0
# Infisical CLI: the entrypoint `infisical run`s the server so runtime secrets (PUBLIC_CLERK_*,
# CLERK_SECRET_KEY, PUBLIC_API_URL, SENTRY_DSN, …) come from Infisical /app. Debian → apt repo.
# PINNED to 0.43.98 — the LAST CLI that fetches secrets via API v3; 0.43.99+ calls /api/v4/secrets,
# which our self-hosted Infisical server doesn't serve (route 404 → every container crash-loops).
# Bump only together with (or after) a server upgrade that adds the v4 routes.
# pipefail: a failed setup-script download (curl -f) fails the build instead of being masked by bash.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
 && apt-get install -y --no-install-recommends infisical=0.43.98 \
 && rm -rf /var/lib/apt/lists/*
# Server-side release tag (must match the release used for the source-map upload above).
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    SENTRY_RELEASE=$GIT_COMMIT
# Full workspace copy: the adapter-node bundle externalizes package deps (clsx, svelte-clerk,
# @sentry/sveltekit, …) and resolves them from node_modules at runtime — build/ alone is not
# self-contained.
COPY --from=build /app /app
# Wrap the server with Infisical secret injection (execs CMD directly if no INFISICAL_* set).
COPY infra/infisical-entrypoint.sh /usr/local/bin/aqsha-entrypoint
RUN chmod +x /usr/local/bin/aqsha-entrypoint
ENTRYPOINT ["/usr/local/bin/aqsha-entrypoint"]
EXPOSE 3000
CMD ["node", "/app/apps/web/build/index.js"]
