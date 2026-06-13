# Long-running Astra agent service (Claude Agent SDK + Hono), plan §1.
# Built from the monorepo root: docker build -f apps/agents/Dockerfile .
FROM oven/bun:1.3.10-slim AS base

WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json bun.lock* ./
COPY apps/agents/package.json apps/agents/package.json
COPY packages/agent-contracts/package.json packages/agent-contracts/package.json

RUN bun install --frozen-lockfile --filter '@aqsha/agents' --filter '@aqsha/agent-contracts' || bun install

COPY packages/agent-contracts packages/agent-contracts
COPY apps/agents apps/agents

WORKDIR /app/apps/agents

# Session files (SDK resume) need a stable writable HOME volume.
ENV HOME=/data
VOLUME ["/data"]

EXPOSE 8787
CMD ["bun", "run", "src/main.ts"]
