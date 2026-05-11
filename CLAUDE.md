# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Companion docs (read these first for the area you're touching)

- `AGENTS.md` — monorepo boundaries, exact dev commands, lint/typecheck quirks, TS config layout.
- `apps/web/AGENTS.md` + `apps/web/DESIGN.md` — UI rules and full design system for the `@aqsha/web` app.
- `apps/app/AGENTS.md` — same Next.js-version warning for `@aqsha/app`.
- `packages/convex/CLAUDE.md` — Convex-specific rules. Always read `packages/convex/convex/_generated/ai/guidelines.md` before writing Convex code; it overrides training-data assumptions.
- `BRAND-IDENTITY.md` — brand voice and palette source of truth.

Next.js in this repo (16.x) has breaking changes vs. training data. Before writing frontend code, consult `node_modules/next/dist/docs/` for the specific API being used.

## Architecture: two parallel product tracks

Aqsha is mid-pivot and currently carries two backends. Know which track you're in before editing:

**Track A — legacy `web + api`** (PostgreSQL-backed)
- `apps/web` (Next.js 16) ⇄ `apps/api` (Bun + Elysia + Eden Treaty) ⇄ PostgreSQL via `packages/db` (Drizzle).
- Astra agent runtime lives in `apps/api/src/agents`, exposed through `AgentsService` to chat routes in `apps/api/src/modules`.
- Auth: Better Auth, server-side sessions in the API.
- Config loaded via `@t3-oss/env-core` in `apps/api/src/config.ts`; env file at `apps/api/.env`.

**Track B — newer `app + convex`** (Convex-backed, "pivot")
- `apps/app` (Next.js 16) ⇄ `packages/convex` (Convex functions, components, schema).
- Convex uses components: `@convex-dev/agent`, `@convex-dev/better-auth`, `@convex-dev/rag`, `@convex-dev/rate-limiter`, `@convex-dev/workflow` — all wired in `packages/convex/convex/convex.config.ts`.
- Agent modules under `packages/convex/convex/agent/` (astra, deepResearch, researchTools, rag, workflow, etc.).
- Schema in `packages/convex/convex/schema.ts` (threadMetadata, researchRuns, researchArtifacts, corpusSources, citationChecks, researchSources, usageLedger, externalLookupCache).
- Auth: `@convex-dev/better-auth` with client in `apps/app/lib/auth-client.ts`.
- Run both sides together with `bun run dev:pivot`.

Shared across tracks: `packages/shared` (TS helpers), `packages/ui` (React primitives and token CSS at `packages/ui/src/styles/globals.css`).

## Commands

Always use `bun` (pinned to 1.3.10 in `packageManager`). Never npm/pnpm/yarn.

```bash
# Whole monorepo
bun install
bun dev                # parallel: web + www + api (Track A default)
bun run dev:pivot      # parallel: app + convex (Track B)
bun run build          # web + www + api
bun run lint           # web, api, shared, db  (parallel)
bun run typecheck      # web, www, app, api, convex, shared, db, ui

# Single workspace
bun run dev:web        # Track A Next.js app
bun run dev:api        # Elysia --watch
bun run dev:app        # Track B Next.js app
bun run dev:convex     # convex dev (codegen + local deployment)
bun run dev:www        # Astro marketing site
bun run build:app      # Track B build

# Database (Track A, run from apps/api)
bun run --filter '@aqsha/api' db:generate   # drizzle-kit generate
bun run --filter '@aqsha/api' db:migrate
bun run --filter '@aqsha/api' db:studio
bun run --filter '@aqsha/api' db:check      # apps/api/src/database/check.ts

# Convex (Track B)
bun run --filter '@aqsha/convex' codegen
bun run --filter '@aqsha/convex' deploy
bun run --filter '@aqsha/convex' logs
bun run --filter '@aqsha/convex' test       # vitest — only package with tests

# Workspace-scoped commands
bun run --filter '@aqsha/<name>' <script>
```

Single Convex test: `bun run --filter '@aqsha/convex' test -- <path>` (vitest forwards args).

## Repo quirks that bite

- **Root ESLint ignores `apps/web/**` entirely** (`eslint.config.mjs`). Web has its own flat config using `eslint-config-next`. If you change root lint rules, they do not reach web.
- **Lint scope ≠ build scope.** `lint` includes `@aqsha/db`; `build` does not. `typecheck` covers everything but `build` only covers web/www/api.
- **No test runner outside `packages/convex`.** No Vitest/Jest/Playwright in web, app, api, www, db, shared, ui. No CI, no pre-commit hooks, no Turborepo.
- **TS configs split.** `tsconfig.base.json` (ES2022, bundler resolution, strict, noEmit) is extended by api/db/shared. `apps/web/tsconfig.json` and `apps/app/tsconfig.json` are independent (target ES2017, Next incremental).
- **Cross-package imports use subpath exports:** `@aqsha/db/schema`, `@aqsha/db/types`, `@aqsha/db/model`; `@aqsha/api/app`, `@aqsha/api/eden`; `@aqsha/convex/api`, `@aqsha/convex/server`.
- **Next config enables `reactCompiler: true`** and sets `turbopack.root` to the repo root.
- **Skills are off by default in the API.** `ASTRA_ENABLE_SKILL_SCRIPTS=false` unless explicitly enabled; Exa MCP tools only load when `ASTRA_EXA_API_KEY` is set.

## Environment

Track A (`apps/api/.env`): `DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `WEB_ORIGIN`, `OPENAI_API_KEY`, plus optional `ASTRA_*` tuning vars (see `apps/api/src/config.ts` for the full schema).

Track A web (`apps/web/.env.local`, optional): `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`).

Track B: Convex manages its own env via `convex dev` / dashboard. Better Auth secrets are set through Convex environment variables.

## Default local ports

- Track A web: `http://localhost:3000`
- Track A api: `http://localhost:3001` (OpenAPI at `/openapi`)
- Track B app: `http://localhost:3000`
- www: Astro's default
