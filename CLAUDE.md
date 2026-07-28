# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Bahasa / Language

Untuk setiap proses brainstorming dan planning, gunakan **bahasa Indonesia**. Istilah teknis (nama fungsi, package, framework, dsb.) tetap dalam bahasa Inggris.

## Companion Docs

- `AGENTS.md` — current monorepo boundaries and exact commands.
- `docs/README.md` — index of product/architecture/migration/agent/features/ops docs.
- `docs/product/versioning-and-changelog.md` — decision guide for product version bumps and whether a change needs a changelog entry. Consult when closing any user-facing work.
- `docs/architecture/` — architecture and design notes (overview, tech stack, API domains, service layer, contracts).
- `apps/web/PRODUCT.md` / `apps/web/DESIGN.md` — product positioning and visual system for the web app.
- Mastra docs (`.mcp.json` `@mastra/mcp-docs-server`, or context7 `/mastra-ai/mastra`) — consult before editing the agent runtime in `apps/agent/src/mastra/` (agents, tools, skills, workflows, processors, memory). Verify Mastra APIs against the installed `@mastra/core` version; don't invent them.

## Architecture

Aqsha is a Postgres-backed research product. Stack: SvelteKit front-of-house, an Elysia REST API, and a Mastra agent runtime, over Postgres/Drizzle + Redis + S3-compatible object storage.

- `apps/web` (`@aqsha/web`): SvelteKit (Svelte 5 runes) public landing + authenticated product app. Talks to the API via a type-safe Eden Treaty client; proxies `/mastra-api/*` to the agent runtime (`@mastra/client-js`).
- `apps/api` (`@aqsha/api`): Elysia REST API + BullMQ workers (feed hydration, metadata enrichment, account deletion, thread-title). Clerk auth, Mayar billing, pino logging.
- `apps/agent` (`@aqsha/agent`): Mastra agent runtime for Astra — chat agent `astra-lite` + `/deep` Workflow `deep-research` (plan-gate HITL → subagents → cited synthesis). Mastra Memory (`mastra_*`) = source of truth for messages; streams via `@mastra/client-js`.
- `packages/db` (`@aqsha/db`): Drizzle ORM schema + migrations for Postgres (pgvector). Shared structured `appError`.
- `packages/services` (`@aqsha/services`): domain services (workspaces, artifacts, billing, RAG, research, citations, chat). One implementation consumed by API routes, workers, and the agent.
- `packages/chat-core` (`@aqsha/chat-core`): shared chat/timeline primitives.
- `packages/ui-svelte` (`@aqsha/ui-svelte`): shared Svelte UI primitives (shadcn-svelte) and token CSS.

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

- `apps/web` is a pure consumer: it imports the API's `App` type for the Eden Treaty client (no codegen) and consumes `@aqsha/ui-svelte`. It must not import `@aqsha/db` / `@aqsha/services` (keeps drizzle out of the client bundle).
- Business logic lives once in `packages/services`; API routes, workers, and the agent are thin callers.
- Test runners are configured in `packages/db`, `packages/chat-core`, `packages/services`, and `apps/api`.
- Environment is per-app `.env` (see each app's `.env.example`); infra (Postgres/Redis/MinIO) for local dev is `infra/compose.dev.yaml`.

## Code Comments

Comments explain **why**, not what — capture non-obvious intent, gotchas, and constraints the code can't state itself. Keep them concise: prefer one tight sentence over a multi-line paragraph, and don't over-annotate obvious code.

- **No references to planning or process artifacts.** Shipped code must stand on its own. Never cite migration-plan sections (`plan §3.5`), phase or task labels (`Phase 9`, `THX-1`, `FND-8`), decision-record numbers, or ticket IDs in comments. If a comment only makes sense to someone holding the plan doc, rewrite it to state the reason directly — or delete it.
- **Don't restate the code** or narrate provenance (`port 1:1 of X`, `streamlined port of Y`). Describe the behavior and the reason, not where it came from.
- **Keep the real gotchas** — layout/ordering hazards, framework quirks, security-sensitive ordering — but phrase them self-containedly so they're useful without any external context.
- Match the surrounding file's comment style and density.

Example — `// Runes-only mode (plan §3.4) turns legacy syntax into a build error` → `// Runes-only mode turns legacy syntax into a build error`.

## Icons

- Use `$lib/icons` for all app icon imports in `apps/web`; direct `@lucide/svelte` imports are banned by eslint outside vendored `src/lib/components/ui/**`.
- Icons are Hugeicons glyphs passed as data (`<Icon icon={SomeIcon} />`). When a needed icon name is missing, add a Lucide-compatible export to `apps/web/src/lib/icons/index.ts` backed by `@hugeicons/core-free-icons`.

## Frontend Data

`apps/web` uses a type-safe Eden Treaty client over TanStack Query (svelte-query).

- The authenticated client lives in `apps/web/src/lib/api/`; query helpers (`unwrap`, `queryKeys`) in `apps/web/src/lib/query/`.
- Co-locate query/mutation hooks per feature in `src/lib/features/<x>/api.ts`.
- Keep UI-only state local with Svelte runes: dialogs, drafts, selected IDs, composer text, and upload progress.

## Error Handling

- Normalize frontend API errors with `apps/web/src/lib/errors`. Prefer `readableApiErrorMessage(error, fallback)` over rendering `error.message` directly.
- For new or touched backend code, return structured application errors from `packages/db/src/appError.ts`.
- Structured error payload shape: `{ message: string; code: string; severity?: "info" | "warning" | "error"; field?: string }`.
- Keep intentional product return unions as return values instead of thrown errors, such as send-message rate-limit or billing-block results.

## Design Context

`apps/web` carries its own design context for the Impeccable design skill:

- `apps/web/PRODUCT.md` — register `product`, platform `web`. Primary users are student researchers; positioning is a blend of a serious research engine (Astra, `/deep`, citations) with an approachable student-writing workspace ("Ideas, neatly linked"). Personality: calm, clear, playful. Anti-references: fear-driven AI-safety tone, generic AI SaaS, strict academic/institutional severity. Target WCAG 2.2 AA.
- `apps/web/DESIGN.md` — the visual system captured from `src/styles/globals.css` (warm-cream OKLCH palette, Inter + Nunito Sans + JetBrains Mono + Caveat, mint/lavender/coral/lemon accents, keycap buttons, full dark mode). Consult before changing tokens or building new screens.
