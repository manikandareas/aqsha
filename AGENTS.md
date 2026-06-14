# Aqsha Monorepo — Agent Notes

## Bahasa / Language

Untuk setiap proses brainstorming dan planning, gunakan **bahasa Indonesia**. Istilah teknis (nama fungsi, package, framework, dsb.) tetap dalam bahasa Inggris.

## Package Manager
- **Bun** `1.3.10` is pinned in `packageManager`. Use `bun install`, never `npm` / `pnpm` / `yarn`.

## Monorepo Boundaries
| Package | Path | Runtime | Key Tech |
|---|---|---|---|
| `@aqsha/app` | `apps/web` | Next.js 16 (App Router) | React 19, Tailwind v4, Convex client |
| `@aqsha/agents` | `apps/agents` | Node/Bun service (Hono) | Claude Agent SDK runtime for Astra — see `apps/agents/AGENTS.md` |
| `@aqsha/convex` | `packages/convex` | Convex | Convex functions/components, Clerk Auth, Agent/Workflow, internal provenance |
| `@aqsha/agent-contracts` | `packages/agent-contracts` | shared | zod contracts shared by convex + agents (+ web later) |
| `@aqsha/ui` | `packages/ui` | shared | React UI primitives and shared token CSS |

## Exact Dev Commands
```bash
# Run active app and Convex backend in parallel
bun dev

# Run one workspace
bun run dev:app
bun run dev:convex
bun run dev:agents      # Claude Agent SDK service (apps/agents)
bun run test:agents     # vitest for apps/agents + packages/agent-contracts

# Verification
bun run lint
bun run typecheck
bun run build
```

## App-Specific Instructions
- **App**: UI rules and Next.js 16 caveats live in `apps/web/AGENTS.md`. Read that before touching product UI.
- **Detail/panel parity**: Thread detail and workspace detail each have a main view and an embedded side panel of the other surface. See `apps/web/AGENTS.md` → **Detail / Panel Parity** before changing either.
- **Convex**: Convex rules live in `packages/convex/AGENTS.md`. Read `packages/convex/convex/_generated/ai/guidelines.md` before editing Convex functions.

## Icons
- Use `@aqsha/ui/icons` for all app icon imports in `apps/web`.
- Use the local `packages/ui/src/icons.tsx` adapter for shared UI package icons, with relative imports such as `../icons`.
- Do not add direct `lucide-react` imports or direct `lucide-react` package dependencies in Aqsha code. `lucide-react` may still appear transitively when required by third-party packages such as BlockNote.
- When a needed icon name is missing, add a Lucide-compatible export to `packages/ui/src/icons.tsx` backed by the official Hugeicons packages (`@hugeicons/react` and `@hugeicons/core-free-icons`).

## Convex Client State
- `apps/web` uses TanStack Query through `@convex-dev/react-query` for Convex client state.
- Prefer shared helpers from `apps/web/lib/convex-query.ts`:
  - `useConvexQueryData` for reactive Convex queries.
  - `useConvexMutationState` / `useConvexMutationFn` for Convex mutations.
  - `useConvexActionState` / `useConvexActionFn` for Convex actions that are submit/side-effect operations.
- Do not add new direct `convex/react` `useQuery`, `useMutation`, or `useAction` usage in `apps/web`.
- Direct `convex/react` imports are still acceptable for provider/client setup and Convex utilities that do not have a TanStack adapter equivalent.
- Keep UI-only state local with React state: dialog open/close, form drafts, selected rows/folders, composer text, and upload progress.
- Server-state loading/error/success should come from TanStack Query mutation/query state unless there is a deliberate local UX state, such as a persistent notice.

## Error Handling
- Client-side Convex errors should be normalized through `apps/web/lib/convex-error.ts`.
- Prefer `readableConvexErrorMessage(error, fallback)` or `readableConvexError(error, fallback)` instead of exposing generic `error.message` directly in UI.
- Plain `Error` from backend/system failures should fall back to a safe user-facing message.
- For new or touched Convex functions, use structured application errors from `packages/convex/convex/lib/appError.ts`:
  - `{ message: string; code: string; severity?: "info" | "warning" | "error"; field?: string }`
- Preserve return-union flows when failure is part of normal product behavior, such as rate-limit/blocking results from message send.
- Existing string `ConvexError` values are still valid, but structured errors are preferred for new/touched code.

## Convex Commands
Run from the repo root with a workspace filter:
```bash
bun run --filter '@aqsha/convex' codegen
bun run --filter '@aqsha/convex' deploy
bun run --filter '@aqsha/convex' logs
bun run --filter '@aqsha/convex' test
```

## TypeScript
- Base config: `tsconfig.base.json` (ES2022, Bundler resolution, strict, noEmit).
- `apps/web/tsconfig.json` is app-specific.
- `packages/convex/tsconfig.json` and `packages/ui/tsconfig.json` own their package checks.

## Notable Defaults
- `apps/web` consumes generated Convex exports through `@aqsha/convex/api` and `@aqsha/convex/server`.
- `apps/web` consumes `@aqsha/ui`.
- `packages/convex`, `apps/agents`, and `packages/agent-contracts` have `vitest` test runners configured.
