# Aqsha Monorepo — Agent Notes

## Package Manager
- **Bun** `1.3.10` is pinned in `packageManager`. Use `bun install`, never `npm` / `pnpm` / `yarn`.

## Monorepo Boundaries
| Package | Path | Runtime | Key Tech |
|---|---|---|---|
| `@aqsha/app` | `apps/app` | Next.js 16 (App Router) | React 19, Tailwind v4, Convex client |
| `@aqsha/www` | `apps/www` | Astro | React islands, Tailwind v4, marketing pages |
| `@aqsha/convex` | `packages/convex` | Convex | Convex functions/components, Better Auth, Agent/RAG/Workflow |
| `@aqsha/ui` | `packages/ui` | shared | React UI primitives and shared token CSS |

## Exact Dev Commands
```bash
# Run active app, Convex backend, and marketing site in parallel
bun dev

# Run the pivot product only
bun run dev:pivot

# Run one workspace
bun run dev:app
bun run dev:convex
bun run dev:www

# Verification
bun run lint
bun run typecheck
bun run build
```

## App-Specific Instructions
- **App**: UI rules and Next.js 16 caveats live in `apps/app/AGENTS.md` and `apps/app/DESIGN.md`. Read those before touching product UI.
- **Convex**: Convex rules live in `packages/convex/AGENTS.md`. Read `packages/convex/convex/_generated/ai/guidelines.md` before editing Convex functions.
- **www**: Marketing site uses `@aqsha/ui` primitives and shared styles from `packages/ui`.

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
- `apps/app/tsconfig.json` and `apps/www/tsconfig.json` are app-specific.
- `packages/convex/tsconfig.json` and `packages/ui/tsconfig.json` own their package checks.

## Notable Defaults
- `apps/app` consumes generated Convex exports through `@aqsha/convex/api` and `@aqsha/convex/server`.
- `apps/app` and `apps/www` both consume `@aqsha/ui`.
- Only `packages/convex` has a test runner configured (`vitest`).
