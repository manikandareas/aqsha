# syntax=docker/dockerfile:1
# Aqsha agent (eve runtime — Astra + deep research). Build context = repo ROOT.
# eve is Node-native (needs Node >=24); deps install with Bun (bun.lock). Agent reads
# @aqsha/{db,services} via the `node`→dist export condition, so build:dist is required.
FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile \
 && bun run build:dist \
 && bun run --filter '@aqsha/agent' build

FROM node:24-slim AS runtime
WORKDIR /app/apps/agent
ENV NODE_ENV=production
ENV PORT=4317
COPY --from=build /app /app
EXPOSE 4317
# eve is a dep of @aqsha/agent only, so bun keeps it workspace-local (NOT hoisted to root).
# Run its entry directly under Node. `--host 0.0.0.0` is REQUIRED for non-Vercel container
# deploys (eve deployment docs §8) — without it eve binds loopback and the web container's
# `http://agent:4317/eve/v1/*` proxy hits connection-refused. `.workflow-data` (eve durable
# state) MUST be a persistent volume in compose.
CMD ["node", "/app/apps/agent/node_modules/eve/bin/eve.js", "start", "--host", "0.0.0.0", "--port", "4317"]
