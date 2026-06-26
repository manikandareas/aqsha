# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Bahasa / Language

Untuk setiap proses brainstorming dan planning, gunakan **bahasa Indonesia**. Istilah teknis (nama fungsi, package, framework, dsb.) tetap dalam bahasa Inggris.

## Companion Docs

- `AGENTS.md` — current monorepo boundaries and exact commands.
- `docs/architecture/` — architecture and design notes (overview, tech stack, API domains, service layer, contracts).
- `BRAND-IDENTITY.md` — brand voice and palette source of truth.
- The `eve` skill — read before editing the agent runtime in `apps/agent` (instructions, skills, tools, channels, subagents).

Next.js in this repo is 16.x. Before writing frontend code that depends on framework behavior, consult the installed `node_modules/next/dist/docs/` docs.

## Architecture

Aqsha is a Postgres-backed research product. Stack: Next.js front-of-house, an Elysia REST API, and an eve agent runtime, over Postgres/Drizzle + Redis + S3-compatible object storage.

- `apps/web` (`@aqsha/web`): Next.js 16 public landing + authenticated product app. Talks to the API via a type-safe Eden Treaty client; proxies `/eve/v1/*` to the agent runtime.
- `apps/api` (`@aqsha/api`): Elysia REST API + BullMQ workers (feed hydration, metadata enrichment, account deletion). Clerk auth, Mayar billing, pino logging.
- `apps/agent` (`@aqsha/agent`): eve agent runtime for Astra (chat + `/deep` deep research). Streams NDJSON; owns durable turn/step state.
- `packages/db` (`@aqsha/db`): Drizzle ORM schema + migrations for Postgres (pgvector). Shared structured `appError`.
- `packages/services` (`@aqsha/services`): domain services (workspaces, artifacts, billing, RAG, research, citations, chat). One implementation consumed by API routes, workers, and the agent.
- `packages/chat-core` (`@aqsha/chat-core`): shared chat/timeline primitives.
- `packages/ui` (`@aqsha/ui`): shared React UI primitives and token CSS.

## Commands

Always use `bun` (pinned to 1.3.10 in `packageManager`). Never npm, pnpm, or yarn.

```bash
# Whole monorepo
bun install
bun dev                # builds dist packages, then runs api + worker + agent + web
bun run build          # build dist packages + agent + web
bun run lint           # api + web
bun run typecheck      # all workspaces
bun run test           # db + chat-core + services + api

# Single process
bun run dev:api
bun run dev:web
bun run dev:agent
bun run dev:worker

# Database (Drizzle)
bun run db:generate
bun run db:migrate
bun run db:studio
```

`@aqsha/db` and `@aqsha/services` build to `dist/` (tsup); `bun run build:dist` / `watch:dist` produce them. The API and agent import from `dist`.

## Repo Notes

- `apps/web` is a pure consumer: it imports the API's `App` type for the Eden Treaty client (no codegen) and consumes `@aqsha/ui`. It must not import `@aqsha/db` / `@aqsha/services` (keeps drizzle out of the client bundle).
- Business logic lives once in `packages/services`; API routes, workers, and the agent are thin callers.
- Test runners are configured in `packages/db`, `packages/chat-core`, `packages/services`, and `apps/api`.
- Environment is per-app `.env` (see each app's `.env.example`); infra (Postgres/Redis/MinIO) for local dev is `infra/compose.dev.yaml`.

## Icons

- Use `@aqsha/ui/icons` for all app icon imports in `apps/web`.
- Use the local `packages/ui/src/icons.tsx` adapter for shared UI package icons, with relative imports such as `../icons`.
- Do not add direct `lucide-react` imports or direct `lucide-react` package dependencies in Aqsha code. `lucide-react` may still appear transitively when required by third-party packages such as BlockNote.
- When a needed icon name is missing, add a Lucide-compatible export to `packages/ui/src/icons.tsx` backed by the official Hugeicons packages (`@hugeicons/react` and `@hugeicons/core-free-icons`).

## Frontend Data

`apps/web` uses a type-safe Eden Treaty client over TanStack Query.

- Get the authenticated client with `useApi()` from `apps/web/lib/api-client.ts`.
- Use `unwrap()` and the centralized `queryKeys` from `apps/web/lib/api-query.ts`.
- Co-locate query/mutation hooks per feature in `features/<x>/api.ts` (e.g. `useWorkspacesList`, `useCreateWorkspace`).
- Keep UI-only state local with React state: dialogs, drafts, selected IDs, composer text, and upload progress.

## Error Handling

- Normalize frontend API errors with `apps/web/lib/api-error.ts`. Prefer `readableApiErrorMessage(error, fallback)` over rendering `error.message` directly.
- For new or touched backend code, return structured application errors from `packages/db/src/appError.ts`.
- Structured error payload shape: `{ message: string; code: string; severity?: "info" | "warning" | "error"; field?: string }`.
- Keep intentional product return unions as return values instead of thrown errors, such as send-message rate-limit or billing-block results.
