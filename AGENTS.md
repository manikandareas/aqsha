# Aqsha Monorepo — Agent Notes

## Bahasa / Language

Untuk setiap proses brainstorming dan planning, gunakan **bahasa Indonesia**. Istilah teknis (nama fungsi, package, framework, dsb.) tetap dalam bahasa Inggris.

## Package Manager
- **Bun** `1.3.10` is pinned in `packageManager`. Use `bun install`, never `npm` / `pnpm` / `yarn`.

## Monorepo Boundaries
| Package | Path | Runtime | Key Tech |
|---|---|---|---|
| `@aqsha/web` | `apps/web` | SvelteKit (Svelte 5 runes) | Tailwind v4, Eden Treaty + TanStack Query; proxies `/mastra-api/*` to the agent |
| `@aqsha/api` | `apps/api` | Bun (Elysia) | REST API + BullMQ workers, Clerk auth, Mayar billing, pino |
| `@aqsha/agent` | `apps/agent` | Node ≥24 (Mastra) | Mastra agent runtime for Astra (chat agent + `/deep` workflow) |
| `@aqsha/db` | `packages/db` | shared (Drizzle) | Postgres schema + migrations (pgvector), structured `appError` |
| `@aqsha/services` | `packages/services` | shared | domain services consumed by API, workers, and agent |
| `@aqsha/chat-core` | `packages/chat-core` | shared | chat/timeline primitives |
| `@aqsha/ui-svelte` | `packages/ui-svelte` | shared | Svelte UI primitives (shadcn-svelte) and token CSS |

## Exact Dev Commands
```bash
# Run the full stack in parallel (api + worker + agent + web)
bun dev

# Run one process
bun run dev:api
bun run dev:web
bun run dev:agent
bun run dev:worker

# Database (Drizzle)
bun run db:generate
bun run db:migrate
bun run db:studio

# Verification
bun run lint
bun run typecheck
bun run test
bun run build
```

Local infra (Postgres/Redis/MinIO): `docker compose -f infra/compose.dev.yaml up` (or `bun run infra:up`).

### Observability (Langfuse) — opsional

Trace token & biaya per run Astra + `/deep`. Langfuse self-host adalah profile `langfuse` di
`infra/compose.dev.yaml` (Postgres + ClickHouse + Redis sendiri; blob numpang MinIO app):

```bash
# isi dulu var LANGFUSE_* di infra/.env (lihat infra/.env.example)
bun run infra:obs        # = docker compose -f infra/compose.dev.yaml --profile langfuse up -d
```

UI: `http://$BIND_HOST:3000` (login `LANGFUSE_INIT_USER_EMAIL`/`PASSWORD`). Agent mengaktifkan
exporter bila `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` (+ `LANGFUSE_BASE_URL` self-host) diisi
di env agent — tanpa key, tracing mati tanpa error. Master kill-switch: `AQSHA_OBSERVABILITY=off`.
Setelah trace masuk, daftarkan harga model custom (`gpt-5.1`, `gpt-5.4-mini`) di Langfuse agar kolom
cost akurat (Langfuse belum kenal model ini). ⚠️ `apps/agent/.env` bisa berupa symlink — pastikan
var Langfuse masuk file yang benar-benar dibaca `mastra dev`.

## Build Pipeline
- `@aqsha/db` and `@aqsha/services` build to `dist/` via tsup (`bun run build:dist`, `watch:dist`).
- `apps/api` (Bun) runs `src/server.ts` directly; `apps/agent` builds the Mastra server (`mastra build` → `.mastra/output`, run with `node`); `apps/web` builds via Vite (adapter-node) and runs `node build`.

## Icons
- Use `$lib/icons` for all app icon imports in `apps/web`; direct `@lucide/svelte` imports are banned by eslint outside vendored `src/lib/components/ui/**`.
- Icons are Hugeicons glyphs passed as data (`<Icon icon={SomeIcon} />`); when a needed icon name is missing, add a Lucide-compatible export to `apps/web/src/lib/icons/index.ts` backed by `@hugeicons/core-free-icons`.

## Error Handling
- Normalize client-side API errors through `apps/web/src/lib/errors` (`readableApiErrorMessage(error, fallback)`); never expose raw `error.message`.
- For new or touched backend code, return structured application errors from `packages/db/src/appError.ts`: `{ message, code, severity?, field? }`.
- Preserve return-union flows when failure is part of normal product behavior, such as rate-limit / billing-block results.

## Code Comments
Comments explain **why**, not what — capture non-obvious intent, gotchas, and constraints the code can't state itself. Keep them concise: prefer one tight sentence over a multi-line paragraph, and don't over-annotate obvious code.

- **No references to planning or process artifacts.** Shipped code must stand on its own. Never cite migration-plan sections (`plan §3.5`), phase or task labels (`Phase 9`, `THX-1`, `FND-8`), decision-record numbers, or ticket IDs in comments. If a comment only makes sense to someone holding the plan doc, rewrite it to state the reason directly — or delete it.
- **Don't restate the code** or narrate provenance (`port 1:1 of X`, `streamlined port of Y`). Describe the behavior and the reason, not where it came from.
- **Keep the real gotchas** — layout/ordering hazards, framework quirks, security-sensitive ordering — but phrase them self-containedly so they're useful without any external context.
- Match the surrounding file's comment style and density.

Example — `// Runes-only mode (plan §3.4) turns legacy syntax into a build error` → `// Runes-only mode turns legacy syntax into a build error`.

## TypeScript
- Base config: `tsconfig.base.json` (ES2022, Bundler resolution, strict, noEmit). Each workspace owns its `tsconfig.json`.

## Notable Defaults
- `apps/web` consumes the API's `App` type for Eden Treaty (no codegen) and `@aqsha/ui-svelte`. It must not import `@aqsha/db` / `@aqsha/services`.
- Business logic lives once in `packages/services`; routes, workers, and the agent are thin callers.
- Test runners: `packages/db`, `packages/chat-core`, `packages/services`, `apps/api`.
