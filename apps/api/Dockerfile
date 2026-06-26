# syntax=docker/dockerfile:1
# Aqsha API (Elysia) + BullMQ worker — runs under Bun. Build context = repo ROOT.
# The compose `worker` service reuses this image with command override `bun run start:worker`.
FROM oven/bun:1.3.10
WORKDIR /app
ENV NODE_ENV=production

# Whole monorepo (.dockerignore strips node_modules/.next/dist/.eve/.workflow-data), then install.
COPY . .
RUN bun install --frozen-lockfile && bun run build:dist

EXPOSE 3001
# ponytail: api/worker run under Bun, reading @aqsha/{db,services} src via the `bun` export
# condition; build:dist is still produced for parity. Override CMD to start:worker for the worker.
CMD ["bun", "run", "start:api"]
