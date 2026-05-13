# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Companion Docs

- `AGENTS.md` — current monorepo boundaries and exact commands.
- `apps/app/AGENTS.md` — Next.js app-specific guidance.
- `apps/app/DESIGN.md` — product UI design source of truth.
- `packages/convex/AGENTS.md` — Convex-specific rules.
- `packages/convex/convex/_generated/ai/guidelines.md` — read before editing Convex functions.
- `BRAND-IDENTITY.md` — brand voice and palette source of truth.

Next.js in this repo is 16.x. Before writing frontend code that depends on framework behavior, consult the installed `node_modules/next/dist/docs/` docs.

## Architecture

Aqsha now keeps the Convex-backed pivot surface only:

- `apps/app`: authenticated Next.js product app.
- `packages/convex`: Convex functions, schema, components, agent runtime, rate limiter, workflow, internal provenance storage, and tests.
- `apps/www`: Astro marketing site.
- `packages/ui`: shared React UI primitives and token CSS.

## Commands

Always use `bun` (pinned to 1.3.10 in `packageManager`). Never npm, pnpm, or yarn.

```bash
# Whole monorepo
bun install
bun dev                # app + convex + www
bun run dev:pivot      # app + convex
bun run build          # app + www
bun run lint           # app + convex
bun run typecheck      # www + app + convex + ui

# Single workspace
bun run dev:app
bun run dev:convex
bun run dev:www
bun run build:app
bun run build:www

# Convex
bun run --filter '@aqsha/convex' codegen
bun run --filter '@aqsha/convex' deploy
bun run --filter '@aqsha/convex' logs
bun run --filter '@aqsha/convex' test
```

Single Convex test: `bun run --filter '@aqsha/convex' test -- <path>`.

## Repo Notes

- `apps/app` consumes generated Convex exports through `@aqsha/convex/api` and `@aqsha/convex/server`.
- `apps/app` and `apps/www` both consume `@aqsha/ui`.
- Only `packages/convex` has a test runner configured.
- Convex environment is managed through `convex dev` and the Convex dashboard.
