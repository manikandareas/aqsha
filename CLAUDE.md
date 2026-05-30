# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Companion Docs

- `AGENTS.md` — current monorepo boundaries and exact commands.
- `apps/web/AGENTS.md` — Next.js app-specific guidance.
- `packages/convex/AGENTS.md` — Convex-specific rules.
- `packages/convex/convex/_generated/ai/guidelines.md` — read before editing Convex functions.
- `BRAND-IDENTITY.md` — brand voice and palette source of truth.

Next.js in this repo is 16.x. Before writing frontend code that depends on framework behavior, consult the installed `node_modules/next/dist/docs/` docs.

## Architecture

Aqsha now keeps the Convex-backed pivot surface only:

- `apps/web`: Next.js public landing plus authenticated product app.
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

- `apps/web` consumes generated Convex exports through `@aqsha/convex/api` and `@aqsha/convex/server`.
- `apps/web` and `apps/www` both consume `@aqsha/ui`.
- Only `packages/convex` has a test runner configured.
- Convex environment is managed through `convex dev` and the Convex dashboard.

## Convex Client State

`apps/web` manages Convex client state with TanStack Query via `@convex-dev/react-query`.

- Use `apps/web/lib/convex-query.ts` helpers for new frontend Convex calls.
- Use `useConvexQueryData` for reactive query data.
- Use `useConvexMutationState` / `useConvexMutationFn` for mutations.
- Use `useConvexActionState` / `useConvexActionFn` for actions that submit work or trigger side effects.
- Do not introduce new direct `convex/react` `useQuery`, `useMutation`, or `useAction` calls in `apps/web`.
- Keep local React state for UI-only concerns: dialogs, drafts, selected IDs, composer text, and upload progress.
- Use TanStack Query state for server-state pending/loading/error/success whenever possible.

Direct `convex/react` imports are still acceptable for provider/client setup and Convex utilities without a TanStack adapter equivalent.

## Error Handling

- Normalize frontend Convex errors with `apps/web/lib/convex-error.ts`.
- Prefer `readableConvexErrorMessage(error, fallback)` over rendering `error.message` directly.
- Treat plain backend/system `Error` values as unexpected and show a safe fallback message.
- For new or touched Convex functions, prefer structured application errors from `packages/convex/convex/lib/appError.ts`.
- Structured error payload shape: `{ message: string; code: string; severity?: "info" | "warning" | "error"; field?: string }`.
- Keep intentional product return unions as return values instead of thrown errors, such as send-message rate-limit or billing-block results.
- Existing string `ConvexError` usage is supported for compatibility, but structured errors are the default for new/touched code.
