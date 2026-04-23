# @aqsha/api — Agent Notes

## Runtime & Package Manager
- **Bun** only. Runtime types come from `bun-types`. Never write Node-specific APIs without checking Bun compatibility first.
- Env validation uses `@t3-oss/env-core` + Zod in `src/config.ts`. Add new env vars there, not via loose `process.env` access.

## Module Architecture (Mandatory Convention)

Every feature lives in `src/modules/<feature>/` with **exactly** these files:

| File | Responsibility |
|---|---|
| `index.ts` | Elysia module definition: routes, prefix, tags, auth guards. **This is the only file that imports `Elysia` and defines HTTP surface.** |
| `model.ts` | Elysia schemas (`t.Object`, `t.String`, …) **or** plain TS interfaces for internal types. Never mix both in one file. |
| `service.ts` | Business logic. Exports a `class FeatureService` + singleton `featureService`. |
| `repository.ts` | Database access. Exports a `class FeatureRepository` + singleton `featureRepository`. |

### Module Wiring
1. Create the module in `src/modules/<name>/index.ts`
2. Import and `.use()` it in `src/app.ts`
3. Never define routes outside `index.ts`. Never write SQL outside `repository.ts`.

### Class + Singleton Pattern
```ts
// service.ts
export class FeatureService {
  constructor(private readonly repo = featureRepository) {}
  async doThing() { return this.repo.doThing(); }
}
export const featureService = new FeatureService();

// repository.ts
export class FeatureRepository {
  constructor(private readonly db: typeof database = database) {}
  async doThing() { … }
}
export const featureRepository = new FeatureRepository(database);
```

## Authentication
- Every protected route **must** `.use(clerkPlugin())` and call `getAuthenticatedIdentity(auth())` from `src/utils.ts`.
- Never access `auth.userId` directly; always use `getAuthenticatedIdentity()` to get the normalized `{ clerkUserId, authTokenIdentifier }` shape.
- Return `status(401, "Unauthorized")` immediately if identity is missing.

## Database
- **Client**: `src/database/client.ts` exports `database` using `drizzle-orm/bun-sql` with full schema loaded.
- **Import paths**: Tables from `@aqsha/db/schema`, types from `@aqsha/db`. Do not import from `drizzle-orm/pg-core` directly except in schema definitions.
- **Transactions**: Use `this.db.transaction(async (tx) => { … })` inside repositories for multi-step writes.
- **Counts / aggregates**: Use `sql<number>\`coalesce(count(*), 0)\`` pattern; Drizzle count returns `string` or `bigint` by default.

## Request / Response Patterns
- Use `status(code, value)` for non-200 returns (401, 204, etc.).
- Always declare `response` schemas in route config so OpenAPI generation is accurate.
- Elysia models that need TypeScript types should use `UnwrapSchema`:
  ```ts
  export type FeatureModel = {
    [K in keyof typeof featureModel]: UnwrapSchema<(typeof featureModel)[K]>;
  };
  ```

## Drizzle Commands
Run from `apps/api`:
```bash
bun run db:generate   # generate migrations
bun run db:migrate    # apply migrations
bun run db:studio     # Drizzle Studio
```
- Schema source of truth is `packages/db/src/schema.ts`.
- Migrations output to `apps/api/drizzle/`.

## Env Requirements
`apps/api/.env` must define:
- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Example at `apps/api/.env.example`.

## Cross-Package Imports
- `@aqsha/db` subpaths: `schema`, `types`, `model`
- `@aqsha/shared` for shared types/helpers
- `@aqsha/api/eden` for type-safe client factory (rarely needed inside API itself)

## Testing
No test runner is configured. Do not add test files unless you also add the runner config.
