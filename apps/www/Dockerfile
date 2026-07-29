# syntax=docker/dockerfile:1
FROM oven/bun:1.3.10 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/www/package.json apps/www/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui-svelte/package.json packages/ui-svelte/package.json
RUN bun install --frozen-lockfile

ARG GIT_COMMIT=unknown
ARG PUBLIC_SITE_URL=https://aqshara.com
ARG PUBLIC_API_URL=https://api.aqshara.com
ARG PUBLIC_SENTRY_DSN
ARG PUBLIC_SENTRY_ENVIRONMENT=production
ARG SENTRY_ORG
ARG SENTRY_PROJECT_WWW

ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_API_URL=$PUBLIC_API_URL \
    PUBLIC_SENTRY_DSN=$PUBLIC_SENTRY_DSN \
    PUBLIC_SENTRY_ENVIRONMENT=$PUBLIC_SENTRY_ENVIRONMENT \
    PUBLIC_SENTRY_RELEASE=$GIT_COMMIT \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT_WWW \
    SENTRY_RELEASE=$GIT_COMMIT

# BuildKit injects SENTRY_AUTH_TOKEN only while this layer runs; it never reaches the static image.
COPY . .
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    if [ -f /run/secrets/sentry_auth_token ]; then export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; fi; \
    bun run --filter '@aqsha/www' build

FROM nginx:1.27-alpine AS runtime
COPY apps/www/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/www/dist /usr/share/nginx/html
EXPOSE 8080
