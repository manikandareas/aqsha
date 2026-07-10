# Aqsha Monorepo — Agent Notes

## Bahasa / Language

Untuk setiap proses brainstorming dan planning, gunakan **bahasa Indonesia**. Istilah teknis (nama fungsi, package, framework, dsb.) tetap dalam bahasa Inggris.

## Package Manager
- **Bun** `1.3.10` is pinned in `packageManager`. Use `bun install`, never `npm` / `pnpm` / `yarn`.

## Monorepo Boundaries
| Package | Path | Runtime | Key Tech |
|---|---|---|---|
| `@aqsha/web` | `apps/web` | Next.js 16 (App Router) | React 19, Tailwind v4, Eden Treaty + TanStack Query; proxies `/mastra-api/*` to the agent |
| `@aqsha/api` | `apps/api` | Bun (Elysia) | REST API + BullMQ workers, Clerk auth, Mayar billing, pino |
| `@aqsha/agent` | `apps/agent` | Node ≥24 (Mastra) | Mastra agent runtime for Astra (chat agent + `/deep` workflow) |
| `@aqsha/db` | `packages/db` | shared (Drizzle) | Postgres schema + migrations (pgvector), structured `appError` |
| `@aqsha/services` | `packages/services` | shared | domain services consumed by API, workers, and agent |
| `@aqsha/chat-core` | `packages/chat-core` | shared | chat/timeline primitives |
| `@aqsha/ui` | `packages/ui` | shared | React UI primitives and token CSS |

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

Local infra (Postgres/Redis/MinIO): `docker compose -f infra/compose.dev.yaml up`.

## Build Pipeline
- `@aqsha/db` and `@aqsha/services` build to `dist/` via tsup (`bun run build:dist`, `watch:dist`).
- `apps/api` (Bun) runs `src/server.ts` directly; `apps/agent` builds the Mastra server (`mastra build` → `.mastra/output`, run with `node`); `apps/web` runs `next start`.

## Icons
- Use `@aqsha/ui/icons` for all app icon imports in `apps/web`.
- Use the local `packages/ui/src/icons.tsx` adapter for shared UI package icons, with relative imports such as `../icons`.
- Do not add direct `lucide-react` imports or direct `lucide-react` package dependencies in Aqsha code. `lucide-react` may still appear transitively when required by third-party packages such as BlockNote.
- When a needed icon name is missing, add a Lucide-compatible export to `packages/ui/src/icons.tsx` backed by the official Hugeicons packages.

## Error Handling
- Normalize client-side API errors through `apps/web/lib/api-error.ts` (`readableApiErrorMessage(error, fallback)`); never expose raw `error.message`.
- For new or touched backend code, return structured application errors from `packages/db/src/appError.ts`: `{ message, code, severity?, field? }`.
- Preserve return-union flows when failure is part of normal product behavior, such as rate-limit / billing-block results.

## TypeScript
- Base config: `tsconfig.base.json` (ES2022, Bundler resolution, strict, noEmit). Each workspace owns its `tsconfig.json`.

## Notable Defaults
- `apps/web` consumes the API's `App` type for Eden Treaty (no codegen) and `@aqsha/ui`. It must not import `@aqsha/db` / `@aqsha/services`.
- Business logic lives once in `packages/services`; routes, workers, and the agent are thin callers.
- Test runners: `packages/db`, `packages/chat-core`, `packages/services`, `apps/api`.

## Cursor Cloud specific instructions
Standard commands live above and in `CLAUDE.md`; this section only captures non-obvious cloud caveats. The startup script runs `bun install` automatically.

### Toolchain / PATH
- **Bun 1.3.10** and **Node 24** are made default via `~/.bashrc` (Node 24 is required by `apps/web` + `apps/agent`; it shadows a `/exec-daemon/node` v22 shim that is otherwise first on PATH). New login shells (`bash -l`) pick this up. If a non-login shell resolves the wrong node/bun, prepend `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$HOME/.bun/bin:$PATH"`.

### Local infra (Postgres/Redis/MinIO) — start each session
Not started by the update script. The Docker daemon and infra containers must be (re)started per boot:
```bash
sudo dockerd >/tmp/dockerd.log 2>&1 &          # if `docker info` fails
sudo docker compose -f infra/compose.dev.yaml up -d
```
- Docker uses the `fuse-overlayfs` storage driver with `containerd-snapshotter` disabled (see `/etc/docker/daemon.json`) — required for Docker-in-Docker here.
- `infra/.env` (local dev creds; gitignored-by-intent but not in `.gitignore`, so never commit it) is already present. Postgres `5432`, Redis `6379`, MinIO S3 `9000` / console `9001`; the `aqsha` bucket is auto-created by `minio-init`.

### Env files & missing secrets
- Per-app `.env` (`apps/api/.env`, `apps/agent/.env`, `apps/web/.env.local`, `packages/db/.env`) already exist, point at `localhost` infra, and use **placeholder** Clerk/OpenAI keys so every process boots (boot validators only check presence, not validity).
- **Real secrets are required for the full product**: `CLERK_SECRET_KEY` + a real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (a placeholder key makes the browser Clerk handshake fail with `host_invalid`, even though the landing page still server-renders via `curl`), and `OPENAI_API_KEY` / `AQSHA_EMBEDDING_API_KEY` for Astra chat, `/deep`, and RAG artifact indexing.
- Run `bun run db:migrate` before first boot (idempotent).

### Run & ports
- `bun dev` runs api (`:3001`), worker (no port), agent/Mastra (`:4111`), web (`:3000`) together (it builds `dist` first). Web proxies `/mastra-api/*` → agent.

### Test caveats (`bun run test`)
- **`@aqsha/services`**: 3 tests fail only in the full parallel run due to Bun `mock.module` leaking across files (e.g. `CHAT_QUEUES`/`ACCOUNT_QUEUES` "not found"); they pass when the file is run in isolation. Pre-existing, not an env issue.
- **`apps/api`**: the artifact upload-pipeline test asserts `indexingStatus === "ready"`, which needs a real embedding key; with a placeholder it becomes `"failed"`.
