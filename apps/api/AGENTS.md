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
| `service.ts` | Business logic. Exports a `class FeatureService`. No module-level singleton. |
| `repository.ts` | Database access. Exports a `class FeatureRepository`. No module-level singleton. |

Shared Elysia plugins live in `src/plugins/`:

| Plugin | Responsibility |
|---|---|
| `services.ts` | Named plugin `plugin.services`. Composition root for singleton repositories/services. Registers them with `.decorate(...)`. |
| `auth-identity.ts` | Named plugin `plugin.auth-identity`. Wraps Clerk and resolves normalized `identity` with `.resolve({ as: "scoped" }, ...)`. |

### Module Wiring
1. Create the module in `src/modules/<name>/index.ts`
2. If the module needs business services, add `.use(servicesPlugin)` in the module and read services from Elysia context.
3. If the module is protected, add `.use(authIdentityPlugin)` in the module and read `identity` from Elysia context.
4. Import and `.use()` the module in `src/app.ts`
5. Never define routes outside `index.ts`. Never write SQL outside `repository.ts`.

### Dependency Injection Pattern

Use Elysia-native DI:

- Singleton dependencies are created only in `src/plugins/services.ts`.
- `servicesPlugin` must be a named plugin and register services with `.decorate(...)`.
- Route modules must not instantiate repositories or services.
- Services receive dependencies via constructors.
- Repositories receive `DatabaseClient` via constructors.
- Do not use default constructor fallbacks to production dependencies.

Good:
```ts
// service.ts
export class FeatureService {
  constructor(private readonly repo: FeatureRepository) {}
  async doThing() { return this.repo.doThing(); }
}

// repository.ts
import type { DatabaseClient } from "../../database/client";

export class FeatureRepository {
  constructor(private readonly db: DatabaseClient) {}
  async doThing() { … }
}

// plugins/services.ts
const featureRepository = new FeatureRepository(database);
const featureService = new FeatureService(featureRepository);

export const servicesPlugin = new Elysia({ name: "plugin.services" })
  .decorate({ featureService });

// modules/feature/index.ts
export const featureModule = new Elysia({ prefix: "/feature" })
  .use(servicesPlugin)
  .get("/", ({ featureService }) => featureService.doThing());
```

Bad:
```ts
// modules/feature/index.ts
const featureService = new FeatureService(new FeatureRepository(database));

// repository.ts
constructor(private readonly db: DatabaseClient = database) {}
```

## Authentication
- Every protected module **must** `.use(authIdentityPlugin)`.
- Route handlers should destructure `identity` from Elysia context. Do not call `clerkPlugin()` or `getAuthenticatedIdentity(auth())` inside route modules.
- `authIdentityPlugin` is the only place that should call `getAuthenticatedIdentity()` to normalize `{ clerkUserId, authTokenIdentifier }`.
- `authIdentityPlugin` owns the missing-identity `401` response shape: `status(401, { error: { code: "unauthorized", message: "Unauthorized" } })`.
- If a route needs the Clerk client, destructure `clerk` from context after `.use(authIdentityPlugin)`.

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
- `@aqsha/db` subpaths: `schema`, `types`, `model`, `utils`
- `@aqsha/shared` for shared types/helpers
- `@aqsha/api/eden` for type-safe client factory (rarely needed inside API itself)

## Type Maximization (Mandatory Practice)

**Always prefer `@aqsha/db` types and utilities before creating custom types.**

### model.ts — Use `spreads()` for Schema Properties
```ts
import { t, type UnwrapSchema } from "elysia";
import { table } from "@aqsha/db/schema";
import { spreads } from "@aqsha/db/utils";

// GOOD: Reuse schema properties from db
const journalBase = spreads({ journals: table.journals }, "select").journals;

export const journalModel = {
  createBody: t.Object({
    title: t.String({ minLength: 1 }),
    type: journalBase.type,  // Reuses enum literal from schema
  }),
};

// BAD: Duplicate enum definitions
const journalType = t.Union([
  t.Literal("general"),
  t.Literal("proposal"),
  t.Literal("thesis"),
]);
```

### repository.ts — Use Const Arrays for Enum Types
```ts
import { journalStatuses, journalTypes, journalVersionTriggers } from "@aqsha/db";

// GOOD: Index into const arrays
type JournalStatus = (typeof journalStatuses)[number];

// BAD: Redefine the same types
type JournalStatus = "active" | "archived";
```

### service.ts — Reuse Types from repository.ts
```ts
import type { JournalContext } from "./repository";

// BAD: Duplicate the same interface
interface JournalContext {
  user: UserRecord;
  workspace: WorkspaceRecord;
}
```

### When to Create Custom Types
Only create custom types when:
1. The API response format differs semantically from DB schema (e.g., serializing `Date` to ISO string)
2. The type is truly module-specific and not found in `@aqsha/db/types`
3. The Elysia schema needs transformation that can't use `spread()` directly

## Testing
No test runner is configured. Do not add test files unless you also add the runner config.
