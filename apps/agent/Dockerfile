# syntax=docker/dockerfile:1
# Aqsha agent (Mastra runtime — Astra chat + deep-research workflow). Build context = repo ROOT.
# Deps install with Bun (bun.lock). Tools/steps read @aqsha/{db,services} via the `node`→dist
# export condition, so build:dist is required before `mastra build`.
FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY . .
# `mastra build` bundles the server (Hono) into apps/agent/.mastra/output. Workspace deps are
# consumed from their dist builds (build:dist), so they don't need re-bundling from raw TS.
RUN bun install --frozen-lockfile \
 && bun run build:dist \
 && bun run --filter '@aqsha/agent' build

FROM node:24-slim AS runtime
WORKDIR /app/apps/agent
ENV NODE_ENV=production
ENV PORT=4317
ENV HOST=0.0.0.0
COPY --from=build /app /app
EXPOSE 4317
# Mastra build output = a self-contained Node server. It reads PORT/HOST from env (see
# src/mastra/index.ts) and binds 0.0.0.0 so the web container's `http://agent:4317/mastra-api/*`
# proxy reaches it. Runtime state (threads/messages/workflow snapshots) lives in Postgres
# (mastra_* tables) — no file-backed durable volume needed.
CMD ["node", "/app/apps/agent/.mastra/output/index.mjs"]
