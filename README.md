# Aqsha

Aqsha is a Postgres-backed personal research product: a SvelteKit app, an Elysia REST API, and an eve agent runtime (Astra + `/deep` deep research).

## Monorepo Structure

```txt
apps/
  web/      SvelteKit public landing + authenticated product app
  api/      Elysia REST API + BullMQ workers
  agent/    eve agent runtime (Astra, deep research)
packages/
  db/       Drizzle ORM schema + migrations (Postgres/pgvector)
  services/ Domain services (business logic) shared by api, workers, agent
  chat-core/ Shared chat/timeline primitives
  ui-svelte/ Shared Svelte UI primitives and styles
```

## Tech Stack

- **Runtime and package manager**: Bun (web + agent run on Node ≥24)
- **Product app**: SvelteKit (Svelte 5 runes), Tailwind CSS 4
- **API**: Elysia + Eden Treaty (type-safe client, no codegen), Clerk auth, Mayar billing, BullMQ workers, pino logging
- **Agent**: eve runtime, AI SDK with OpenAI-compatible providers
- **Data**: Postgres + Drizzle (pgvector), Redis, S3-compatible object storage (MinIO/R2)
- **Shared UI**: shadcn-svelte components (bits-ui) in `packages/ui-svelte`

## Getting Started

Install dependencies from the repository root:

```bash
bun install
```

Start local infrastructure (Postgres/Redis/MinIO), apply migrations, then run the stack:

```bash
docker compose -f infra/compose.dev.yaml up -d
bun run db:migrate
bun dev          # api + worker + agent + web
```

Or run a single process:

```bash
bun run dev:api
bun run dev:web
bun run dev:agent
bun run dev:worker
```

## Scripts

```bash
bun run build       # build dist packages + agent + web
bun run lint        # lint api + web
bun run typecheck   # type-check all workspaces
bun run test        # db + chat-core + services + api
```

Database (Drizzle) commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

## Development Notes

- `apps/web` imports the API's `App` type for the Eden Treaty client (no codegen) and consumes `@aqsha/ui-svelte`. It must not import `@aqsha/db` / `@aqsha/services`.
- Business logic lives once in `packages/services`; API routes, workers, and the agent are thin callers.
- `@aqsha/db` and `@aqsha/services` build to `dist/` (tsup); the API and agent import from there.
- Each app reads its own `.env` (see each app's `.env.example`).
- Deployment is Docker via Dokploy: per-app `Dockerfile` + the root `compose.yaml` (apps + infra). `infra/compose.dev.yaml` is local-dev infrastructure only.
