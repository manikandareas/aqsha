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
# ponytail: eve bin is hoisted to the root node_modules; run it under Node from the agent
# project dir. `--port 4317` mirrors the dev script. `.workflow-data` (eve durable state)
# MUST be a persistent volume in compose. Validate flags with `eve --help` on first build.
CMD ["node", "/app/node_modules/.bin/eve", "start", "--port", "4317"]
