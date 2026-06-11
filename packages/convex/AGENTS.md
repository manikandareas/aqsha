<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# Aqsha Convex conventions

These are the **project-specific** rules for `packages/convex`, layered on top of
the platform rules in `convex/_generated/ai/guidelines.md` (read that first). They
encode the structure established by the 2026-06 reorg + dedup pass. Follow them so
new Convex code stays consistent with the existing boilerplate.

## Commands (always `bun`, never npm/pnpm/yarn)

```bash
# From repo root — the per-change GATE (run all three before considering work done):
bun run typecheck                         # app + convex + ui — catches every typed api.*/internal.* break
bun run lint
bun run --filter '@aqsha/convex' test     # vitest (convex-test); single file: ... test -- <path>

# Push to the DEV deployment to validate schema/indexes/validators at runtime:
bun run dev:convex                        # watch mode, or:
npx convex dev --once                     # one-shot push (run inside packages/convex)
```

`npx convex deploy` targets **production** — never run it for validation; use
`convex dev --once` against the dev deployment. `convex codegen` regenerates the
typed `api`/`internal` objects after file moves.

## Module organization (the core convention)

**Domain modules use a facade file + same-named helper folder.** A top-level
`<domain>.ts` registers the public Convex functions (keeping the stable
`api.<domain>.*` path) and delegates to plain helpers in a sibling `<domain>/`
folder. The two coexist — this is the canonical pattern; see `auth.ts` + `auth/`
and `accountCleanup.ts` + `accountCleanup/`.

```
convex/
  feed.ts            facade: api.feed.* (public queries/mutations + cron internals)
  feed/              helpers + submodules for the feed domain
    model.ts         plain helpers (NO Convex registrations)
    validators.ts    shared v.* validators / Infer source types
    claims.ts        submodule that registers internal.feed.claims.*
    providers/…      external clients used only by feed (gdelt, news, factCheck)
  explore.ts  explore/        artifacts.ts  artifacts/
  workspaces.ts workspaces/    papers/ (extractions, metadataEnrichment, grobid/, ingest/)
  billing/  auth.ts auth/  accountCleanup.ts accountCleanup/
  agent/             AI runtime, grouped into subfolders (below)
  lib/               cross-domain leaf helpers (NO registrations)
  schema.ts  http.ts  crons.ts  convex.config.ts  limits.ts  onboarding.ts
```

Rules:

- **Put new functions in the right domain module.** Do NOT add loose top-level
  files. A helper with no Convex registrations goes in the domain folder (or
  `lib/` if cross-domain); a new public/internal function goes in the facade or a
  named submodule under the folder.
- **`lib/` holds shared leaf helpers only** — `appError.ts`, `text.ts`
  (`collapse`, `normalizeKey`, `numberOrUndefined`, `firstNonEmpty`,
  `uniqueCompact`), `arrays.ts` (`asArray`), `identifiers.ts` (canonical
  `normalizeDoi`), `paperTypes.ts`, `userImage.ts`. No `query`/`mutation`/`action`
  registrations live in `lib/`. **Reuse these — do not re-implement normalizers,
  DOI parsing, or array coercion locally.**
- **`agent/` is grouped into subfolders**: `providers/` (external clients,
  caching), `research/` (deep research + tools + sources), `hitl/` (human-in-the-loop),
  `prompt/` (command parsing/routing), `context/` (thread/workspace/RAG context),
  `tools/` (artifact/workspace tool helpers). The `agent/` root keeps the
  high-traffic orchestration entrypoints: `messages`, `threads`, `runtime`,
  `workflow`, `models`, `rateLimits`, `runLifecycle`, `threadTitles`, `astra`.
- **Path = reference.** A function's `api.*`/`internal.*` path mirrors its file
  path (`feed/claims.ts` → `internal.feed.claims.*`). Moving a file changes every
  reference — but all references are typed, so `bun run typecheck` catches each
  break (backend, `crons.ts`, scheduler calls, `http.ts`, `apps/web`, and the
  `packages/convex/package.json` `exports` subpaths). Update them in lockstep and
  re-run `convex codegen`.

## Function authoring

- **Object syntax always**: `query/mutation/action({ args, returns, handler })`
  (and the `internal*` variants). See guidelines.md.
- **`args` validators on every function.** **`returns` validators on public
  functions** whenever the return shape is provably exact — reuse an existing
  validator (e.g. `explorePaperValidator`, `feedItemValidator`) or a simple
  `v.object({ ok: v.boolean() })` / `v.id(...)` / `v.string()`. `returns` is
  **runtime-enforced**: a mismatch throws `ReturnsValidationError` only when the
  function is invoked (typecheck won't catch it). When returning a DB doc, strip
  `_id`/`_creationTime` to match a field-only validator, or include them in the
  validator. If you can't be 100% certain of a complex/mapped shape, leave
  `returns` off rather than risk a runtime break.
- **public vs internal**: client-callable → `query`/`mutation`/`action`;
  backend-only → `internalQuery`/`internalMutation`/`internalAction`. Keep the
  public surface (the security perimeter) small.
- **No external IO in mutations.** `fetch`, LLM calls, email, etc. go in
  `action`s; persist via `ctx.runMutation(internal.x.y, …)`. Offload heavy work
  from a mutation's transaction with `ctx.scheduler.runAfter(0, internal.x.y, …)`.
- **Cross-function calls use typed `FunctionReference`s** (`api.*`/`internal.*`),
  never string paths. Type-annotate the return when calling a function defined in
  the same file (TS circularity).
- **Auth at the boundary**: gate mutations and private queries with
  `requireCurrentUser(ctx)` (from `auth.ts`) or the domain's `assert*Owner`
  helper. Every owner-scoped table is keyed by `ownerUserId`.

## Schema & indexes

- **Every read path has an index.** Never `ctx.db.query(t).filter(...)` without a
  preceding `.withIndex(...)` (that's a full table scan). Index names are
  `by_<fields>`; never include `_creationTime` (implicit tiebreaker) and never use
  reserved names (`by_id`, `by_creation_time`, leading `_`).
- **Schema evolution**: add fields as `v.optional(...)` → deploy → backfill →
  optionally tighten. For greenfield prod, skip one-time backfills (the write path
  populates new structures from the first event).
- **Denormalize derived aggregates** rather than scanning, and maintain them in
  the **same transaction** as the source write — e.g. `usageDailyRollup` is bumped
  inside the same mutation that inserts `providerUsageLedger`;
  `domainReliability.unreliable` is recomputed on each `recordOutcome`. Back these
  with their own index (`by_owner_date`, `by_unreliable`).

## Bounded reads & performance

- **Never bare `.collect()` on a table that grows with usage** (messages, feed
  items, ledgers, run events, artifacts, …). Use `.take(N)` or
  `.paginate(paginationOptsValidator)`. For per-run/per-day fan-out, cap with
  `.order("desc").take(N)` (reverse if you need chronological order).
- **Parallelize independent point-reads** with order-preserving
  `Promise.all(items.map(...))` instead of sequential `await` in a loop.
- **Respect limits**: ~16K doc reads, ~8K writes, 1 MiB/doc, 8 MiB payload, ~1s
  query CPU, 10 min action. For big sweeps use pagination + scheduled
  continuation (or `@convex-dev/migrations`), not one giant function.

## Error handling

- New/touched functions throw **structured** errors via `throwAppError({ message,
  code, severity?, field? })` from `lib/appError.ts` — not raw `throw new Error`
  or bare-string `ConvexError`. Keep the `message` string stable; the frontend
  renders it via `readableConvexErrorMessage` (`apps/web/lib/convex-error.ts`).
- **Intentional product outcomes stay as return-union values, NOT throws** —
  rate-limit results, billing/quota blocks (`{ ok: false, reason: … }`). Don't
  convert these to thrown errors.
- When unwrapping a caught error into a stored string, prefer the structured
  payload (`error.data.message`) over the serialized `ConvexError`.

## Components — don't roll your own

Use the mounted Convex components (in `convex.config.ts`) instead of hand-rolling:
`@convex-dev/agent` (chat/threads/messages/tools — never a manual `messages`
table), `@convex-dev/rag`, `@convex-dev/workflow` (multi-step/durable flows),
`@convex-dev/rate-limiter` (`limits.ts`), `@convex-dev/polar` (billing). Access via
`components.*`; their references are config-sensitive, not path-sensitive.

## Crons & HTTP (path-sensitive)

- `crons.ts`: only `crons.interval` / `crons.cron` (never the `daily`/`weekly`
  helpers), each pointing at a typed `internal.*` reference. Cron job **names** are
  stable across refactors; only the underlying function path changes.
- `http.ts`: route handlers reference typed `internal.*` functions. Both files
  must be updated in lockstep when a referenced function moves.

## Testing & the gate

- Add `vitest` (`convex-test`) coverage for new logic and for behavior-preserving
  refactors (assert the new path matches the old). Tests live in
  `packages/convex/tests/`.
- **Before declaring work done**, run the full gate: `bun run typecheck` (all
  three workspaces) + `bun run lint` + convex tests, then `npx convex dev --once`
  and watch the push log for `Schema validation failed`, `ReturnsValidationError`,
  `ArgumentValidationError`, or "Couldn't find function …" (a stale ref).

## Frontend boundary (brief)

`apps/web` consumes Convex via `@aqsha/convex/api` + `/server` and the TanStack
Query helpers in `apps/web/lib/convex-query.ts` (`useConvexQueryData`,
`useConvexMutationFn`, `useConvexActionFn`). Don't add new direct `convex/react`
`useQuery`/`useMutation`/`useAction` calls. Public subpath exports (e.g.
`@aqsha/convex/feed`) are declared in `packages/convex/package.json` `exports` —
keep them pointing at the right file after moves.
