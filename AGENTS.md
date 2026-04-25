# Aqsha Monorepo — Agent Notes

## Package Manager
- **Bun** `1.3.10` is pinned in `packageManager`. Use `bun install`, never `npm` / `pnpm` / `yarn`.

## Monorepo Boundaries
| Package | Path | Runtime | Key Tech |
|---|---|---|---|
| `@aqsha/web` | `apps/web` | Next.js 16 (App Router) | React 19, Tailwind v4, shadcn base-nova, no `src/` dir |
| `@aqsha/api` | `apps/api` | Bun | Elysia 1.4, Drizzle ORM, PostgreSQL, Better Auth |
| `@aqsha/db` | `packages/db` | shared | Drizzle schema / types / model |
| `@aqsha/shared` | `packages/shared` | shared | Types and helpers |

## Exact Dev Commands
```bash
# Run everything in parallel
bun dev

# Run one workspace
bun run dev:web      # Next.js dev server (Turbopack)
bun run dev:api      # Elysia with --watch

# Verification (runs in parallel across workspaces)
bun run lint         # includes @aqsha/web, @aqsha/api, @aqsha/shared, @aqsha/db
bun run typecheck    # same scope as lint
bun run build        # builds web + api only
```

## App-Specific Instructions
- **Web**: UI rules, design tokens, and Next.js 16 caveats live in `apps/web/AGENTS.md` and `apps/web/DESIGN.md`. Read those before touching any frontend code.
- **API**: Env is loaded via `dotenv/config` in `apps/api/src/config.ts`. Required vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`. Example at `apps/api/.env.example`.

## Database / ORM
- Schema source of truth: `packages/db/src/schema.ts`
- Drizzle config lives in `apps/api/drizzle.config.ts` and points at `../../packages/db/src/schema.ts`
- Migrations output to `apps/api/drizzle/`
- Commands (run from `apps/api`):
  ```bash
  bun run db:generate
  bun run db:migrate
  bun run db:studio
  ```

## Linting Quirks
- Root `eslint.config.mjs` **ignores `apps/web/**`** completely; web maintains its own `eslint.config.mjs` using `eslint-config-next`.
- Root lint/typecheck filters include `@aqsha/db` even though `build` does not.

## TypeScript
- Base config: `tsconfig.base.json` (ES2022, Bundler resolution, strict, noEmit)
- `apps/web/tsconfig.json` is independent (does not extend base); uses `target: ES2017`, `jsx: react-jsx`, Next.js incremental.
- `apps/api/tsconfig.json`, `packages/db/tsconfig.json`, and `packages/shared/tsconfig.json` all extend the base.

## Notable Defaults
- No test runner is configured yet (no Vitest, Jest, or Playwright configs found).
- No CI / GitHub Actions, pre-commit hooks, or task runners (Turborepo, etc.).
- Next.js config enables `reactCompiler: true` and sets `turbopack.root` to the repo root.

## Cross-Package Imports
- `@aqsha/db` exposes subpath exports: `schema`, `types`, `model` (see `packages/db/package.json`).
- `@aqsha/api` exposes `app` and `eden` for type-safe client consumption.
