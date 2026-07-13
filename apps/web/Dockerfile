# syntax=docker/dockerfile:1
# Aqsha web (Next.js 16, standalone output). Build context = repo ROOT.
# NEXT_PUBLIC_* are inlined into the client bundle at build time → pass as build args.
FROM oven/bun:1.3.10 AS build
WORKDIR /app

# oven/bun ships with an EMPTY system trust store (/etc/ssl/certs) — Bun itself bundles its own CA
# list so `bun install` works, but sentry-cli (native binary, system trust store) fails every TLS
# call with curl error 60. Install ca-certificates so the Sentry release + source-map upload works.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL=https://aqshara.com
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app
# Sentry: client DSN (baked into the bundle), commit tag for the release, org/project for source-map
# upload. The auth TOKEN is NOT an ARG — it comes in as a BuildKit secret on the build RUN below so it
# never lands in an image layer. All optional: no DSN → SDK no-op; no token → upload skipped.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG GIT_COMMIT=unknown
ARG SENTRY_ORG
ARG SENTRY_PROJECT_WEB
# CI=true (passed by deploy.yml) makes next.config.ts run the Sentry plugin non-silently so the
# source-map upload logs are visible in the CI build. Unset in local builds → plugin stays quiet.
ARG CI
# Manifests + lockfile first → `bun install` layer cached across source-only edits (all workspace
# members required for --frozen-lockfile; keep in sync with root package.json `workspaces`).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

# Build-time env set AFTER install: SENTRY_RELEASE=$GIT_COMMIT changes every commit, so keeping this
# layer below `bun install` stops it from invalidating the manifest-first dependency-install cache.
ENV CI=$CI \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_RELEASE=$GIT_COMMIT \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT_WEB=$SENTRY_PROJECT_WEB \
    NEXT_TELEMETRY_DISABLED=1

COPY . .
# SENTRY_AUTH_TOKEN via secret mount (optional): present in CI → withSentryConfig uploads source maps
# then deletes them; absent (local build) → upload disabled, build still succeeds.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    bun run build:dist \
 && bun run --filter '@aqsha/web' build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Infisical CLI: the entrypoint `infisical run`s the server so runtime secrets (CLERK_SECRET_KEY,
# SENTRY_DSN_WEB, …) come from Infisical /app. NEXT_PUBLIC_* stay baked at build. Debian → apt repo.
# PINNED to 0.43.98 — the LAST CLI that fetches secrets via API v3; 0.43.99+ calls /api/v4/secrets,
# which our self-hosted Infisical server doesn't serve (route 404 → every container crash-loops).
# Bump only together with (or after) a server upgrade that adds the v4 routes.
# pipefail: a failed setup-script download (curl -f) fails the build instead of being masked by bash.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
 && apt-get install -y --no-install-recommends infisical=0.43.98 \
 && rm -rf /var/lib/apt/lists/*
# Server-side release tag (must match the baked client release). SENTRY_DSN_WEB comes from Infisical.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    SENTRY_RELEASE=$GIT_COMMIT
# Next standalone (outputFileTracingRoot = repo root): server at apps/web/server.js + bundled
# node_modules. Static + public are not bundled, so copy them alongside.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Wrap the Next server with Infisical secret injection (execs CMD directly if no INFISICAL_* set).
COPY infra/infisical-entrypoint.sh /usr/local/bin/aqsha-entrypoint
RUN chmod +x /usr/local/bin/aqsha-entrypoint
ENTRYPOINT ["/usr/local/bin/aqsha-entrypoint"]
EXPOSE 3000
# Runtime needs AGENT_ORIGIN (proxy target) + server-side Clerk + Sentry DSN; NEXT_PUBLIC_* are baked in.
CMD ["node", "apps/web/server.js"]
