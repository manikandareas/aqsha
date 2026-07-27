# Svelte Migration Conflict Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebase `feat/apps-svelte-migration` onto `origin/development`, preserve both branches' functional changes, and open a mergeable PR to `development`.

**Architecture:** Preserve the source branch topology with `git rebase --rebase-merges origin/development`. Resolve root manifests as the union of both app families, regenerate the Bun lockfile from that manifest, and re-sequence the source Drizzle migrations after development's waitlist migration while retaining every SQL operation. The rebase result is validated by structural Git checks and package-level type/test commands before it is force-pushed safely and submitted as a PR.

**Tech Stack:** Git, GitHub CLI, Bun 1.3.10, Drizzle Kit, TypeScript, Svelte 5, Next.js 16.

## Global Constraints

- Work only in `/Users/vitoandareasmanik/Development/project/aqsha-svelte-migration` on `feat/apps-svelte-migration`.
- Preserve the development waitlist/`apps/www` changes and every source Svelte, Typst, explore, and library change.
- Use Bun 1.3.10; do not use npm, pnpm, or yarn.
- Use `git push --force-with-lease`, never `--force`.
- Do not run database migrations against a shared or production database during this conflict-resolution task.
- Keep the existing structured error and icon conventions unchanged.

---

## File Structure

| Path | Responsibility after resolution |
| --- | --- |
| `package.json` | Declares both web marketing (`apps/www`) and Svelte (`apps/svelte`, `packages/ui-svelte`) workspaces and exposes both command families. |
| `bun.lock` | Bun-generated dependency graph for the combined workspace manifest. |
| `packages/services/src/index.ts` | Exports waitlist services while retaining Typst's subpath-only boundary comment. |
| `packages/services/src/quota/rate-limits.ts` | Provides the union of waitlist, LaTeX, Typst, and OA-download quota rule names/configurations. |
| `packages/db/migrations/0035_waitlist_entries.sql` | Existing development waitlist migration; remains unchanged. |
| `packages/db/migrations/0036_short_doctor_doom.sql`–`0050_library_paper_ingest.sql` | Renumbered source migration sequence; each SQL body is preserved unchanged. |
| `packages/db/migrations/meta/0035_snapshot.json` | Existing development waitlist snapshot; remains unchanged. |
| `packages/db/migrations/meta/0036_snapshot.json`–`0047_snapshot.json` | Renumbered source snapshots, chained after the waitlist snapshot and containing the waitlist schema. |
| `packages/db/migrations/meta/_journal.json` | Ordered Drizzle journal: `0035_waitlist_entries`, then source migrations `0036`–`0050`. |
| `docs/superpowers/specs/2026-07-27-svelte-migration-conflict-resolution-design.md` | Approved intent and acceptance criteria. |

## Task 1: Protect the source branch and start a topology-preserving rebase

**Files:**
- Modify: Git history and index only in `feat/apps-svelte-migration`
- Test: Git ref and status inspection

**Interfaces:**
- Consumes: clean `feat/apps-svelte-migration`, fetched `origin/development`
- Produces: an in-progress rebase whose `HEAD` has `origin/development` as its new base

- [ ] **Step 1: Confirm this worktree owns the source branch and has no uncommitted changes**

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration status --short --branch
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration branch --show-current
```

Expected: `feat/apps-svelte-migration` is checked out and only the committed design/specification files are present in history.

- [ ] **Step 2: Fetch the PR target and create a local recovery ref**

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration fetch origin development feat/apps-svelte-migration
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration branch backup/feat-apps-svelte-migration-pre-rebase HEAD
```

Expected: the backup branch resolves to the exact source commit before history rewriting.

- [ ] **Step 3: Begin a rebase that retains merge topology**

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration rebase --rebase-merges origin/development
```

Expected: Git either completes without intervention or stops only at conflicts. Do not use `--skip`, because each source change must be preserved.

- [ ] **Step 4: At every stop, record the conflict set before resolution**

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration status --short
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration diff --name-only --diff-filter=U
```

Expected: only explicit conflict paths are edited; automatically merged files are left intact unless their merged content fails validation.

## Task 2: Resolve root manifest, service-barrel, and quota conflicts as unions

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `packages/services/src/index.ts`
- Modify: `packages/services/src/quota/rate-limits.ts`
- Test: workspace discovery, package-level type checks, package-level tests

**Interfaces:**
- Consumes: development's `apps/www` and waitlist changes plus source's Svelte/Typst changes
- Produces: a manifest and service exports/rules that expose both feature sets

- [ ] **Step 1: Resolve `package.json` by retaining the complete workspace union**

Set `workspaces` to this ordered list:
```json
[
  "apps/api",
  "apps/web",
  "apps/www",
  "apps/svelte",
  "apps/agent",
  "packages/chat-core",
  "packages/db",
  "packages/services",
  "packages/ui",
  "packages/ui-svelte"
]
```

Keep the development `dev:web`, `dev:www`, `build` inclusion of `@aqsha/www`, and root `typecheck` inclusion of `@aqsha/www`. Keep the source `dev:svelte`, `build:svelte`, `start:svelte`, `lint:svelte`, `typecheck:svelte`, `typecheck:ui-svelte`, and `test:svelte` scripts. Change the root `dev` command to launch `dev:web`, `dev:www`, and `dev:svelte` alongside API, worker, agent, and dist watch. Retain source override `"@vedivad/typst-web-service": "0.18.8"` together with the existing overrides.

- [ ] **Step 2: Resolve the service barrel without exposing Typst from the root package**

Retain this existing source comment immediately before the final export block:
```ts
// Modul typst dipakai lewat subpath `@aqsha/services/typst` (bukan barrel root).
// Barrel root ikut di-typecheck oleh konsumen web (via tipe App @aqsha/api) yang
// tak punya tipe global Bun; runner.ts memakai Bun.spawn. Menjaga typst di subpath
// mengikuti konvensi granular paket ini dan mencegah Bun bocor ke type-graph web.
```

Also retain all development waitlist exports from `./waitlist/model`, `./clients/resend`, and `./waitlist.service`; do not replace either block with the other.

- [ ] **Step 3: Resolve quota rules by retaining every literal and configuration**

Ensure `RateLimitRule` includes these six literals in addition to existing integration rules:
```ts
| "waitlist:submit-ip"
| "waitlist:submit-email"
| "waitlist:verify-ip"
| "latex:compile"
| "typst:compile"
| "library:oa-download";
```

Ensure `RATE_LIMIT_RULES` retains these exact values:
```ts
"waitlist:submit-ip": { points: 5, duration: 600 },
"waitlist:submit-email": { points: 3, duration: 3600 },
"waitlist:verify-ip": { points: 10, duration: 600 },
"latex:compile": { points: 10, duration: 60 },
"typst:compile": { points: 10, duration: 60 },
"library:oa-download": { points: 30, duration: 60 },
```

- [ ] **Step 4: Resolve the lockfile temporarily only to permit rebase continuation**

For a `bun.lock` conflict during the rebase, use the source version as the temporary staged file, then continue. The final `bun install` in Task 4 regenerates it from the union manifest.

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration checkout --theirs bun.lock
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration add package.json bun.lock packages/services/src/index.ts packages/services/src/quota/rate-limits.ts
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration rebase --continue
```

Expected: the rebase advances; if Git stops again, repeat Task 1 Step 4 and resolve the newly reported paths without discarding content.

## Task 3: Re-sequence the Drizzle migration collision without losing SQL or schema state

**Files:**
- Rename: `packages/db/migrations/0035_short_doctor_doom.sql` through `0049_library_paper_ingest.sql`
- Rename: `packages/db/migrations/meta/0035_snapshot.json` through `0046_snapshot.json`
- Modify: `packages/db/migrations/meta/_journal.json`
- Test: migration filename/journal/snapshot consistency checks

**Interfaces:**
- Consumes: `0035_waitlist_entries` and its snapshot from development; all 15 source SQL migrations and 12 source snapshots
- Produces: a unique sequential migration namespace: development `0035`, source `0036`–`0050`

- [ ] **Step 1: Preserve development migration 0035 as the sequence anchor**

Keep these development files unchanged:
```text
packages/db/migrations/0035_waitlist_entries.sql
packages/db/migrations/meta/0035_snapshot.json
```

Do not overwrite the waitlist SQL, snapshot ID, or the existing journal entry `{ "idx": 35, "tag": "0035_waitlist_entries" }`.

- [ ] **Step 2: Apply this one-to-one source SQL renumbering**

Rename only the numeric prefixes; preserve every SQL body:
```text
0035_short_doctor_doom.sql              -> 0036_short_doctor_doom.sql
0036_lucky_pandemic.sql                  -> 0037_lucky_pandemic.sql
0037_absent_gambit.sql                   -> 0038_absent_gambit.sql
0038_melted_serpent_society.sql           -> 0039_melted_serpent_society.sql
0039_dizzy_chamber.sql                    -> 0040_dizzy_chamber.sql
0040_nervous_ezekiel_stane.sql            -> 0041_nervous_ezekiel_stane.sql
0041_tidy_azazel.sql                      -> 0042_tidy_azazel.sql
0042_even_white_queen.sql                 -> 0043_even_white_queen.sql
0043_careful_nextwave.sql                 -> 0044_careful_nextwave.sql
0044_volatile_moon_knight.sql             -> 0045_volatile_moon_knight.sql
0045_typst_proposal_resubmit.sql           -> 0046_typst_proposal_resubmit.sql
0046_open_nighthawk.sql                   -> 0047_open_nighthawk.sql
0047_explore_papers_literature_fields.sql -> 0048_explore_papers_literature_fields.sql
0048_feed_items_literature_shape.sql      -> 0049_feed_items_literature_shape.sql
0049_library_paper_ingest.sql             -> 0050_library_paper_ingest.sql
```

Use `git mv` for paths already tracked in the current rebase state. When a later replayed commit attempts to add an old prefix, move it immediately to its mapped destination before staging and continuing.

- [ ] **Step 3: Re-chain all source Drizzle snapshots after the waitlist snapshot**

Rename snapshots using the same +1 prefix:
```text
0035_snapshot.json -> 0036_snapshot.json
0036_snapshot.json -> 0037_snapshot.json
0037_snapshot.json -> 0038_snapshot.json
0038_snapshot.json -> 0039_snapshot.json
0039_snapshot.json -> 0040_snapshot.json
0040_snapshot.json -> 0041_snapshot.json
0041_snapshot.json -> 0042_snapshot.json
0042_snapshot.json -> 0043_snapshot.json
0043_snapshot.json -> 0044_snapshot.json
0044_snapshot.json -> 0045_snapshot.json
0045_snapshot.json -> 0046_snapshot.json
0046_snapshot.json -> 0047_snapshot.json
```

In renumbered `0036_snapshot.json`, retain its source `id`, replace `prevId` with the `id` in development's unchanged `0035_snapshot.json`, and add the full `public.waitlist_entries` table definition, indexes, unique constraint, and check constraint from development's snapshot. Add the same complete waitlist table metadata to each subsequent renumbered source snapshot (`0037`–`0047`) because Drizzle snapshots are complete schema representations. Keep each later snapshot `id` and its source-chain `prevId` unchanged.

- [ ] **Step 4: Update the journal to match the renamed migration files**

Keep idx 35 unchanged. Rewrite the 15 source entries to idx 36–50 and tags `0036_short_doctor_doom` through `0050_library_paper_ingest`, retaining each original timestamp, version `"7"`, and `breakpoints: true`. No journal entry may share an `idx` or `tag`.

- [ ] **Step 5: Stage each resolved migration stop and continue the rebase**

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration add packages/db/migrations
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration rebase --continue
```

Expected: no migration is skipped. If Git stops on a later migration add/add conflict, use the mapping in Step 2 or Step 3, stage the resolved path, and continue.

- [ ] **Step 6: Check the completed migration namespace before any runtime validation**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
find packages/db/migrations -maxdepth 1 -name '*.sql' -print | sort | tail -n 16
bun -e 'const journal = await Bun.file("packages/db/migrations/meta/_journal.json").json(); const entries = journal.entries; const ids = entries.map((entry) => entry.idx); const tags = entries.map((entry) => entry.tag); if (new Set(ids).size !== ids.length || new Set(tags).size !== tags.length) process.exit(1); console.log(entries.slice(-16).map((entry) => `${entry.idx}:${entry.tag}`).join("\n"));'
```

Expected: `0035_waitlist_entries` is followed by exactly `0036` through `0050`, with no duplicate idx or tag.

## Task 4: Regenerate dependencies and validate the rebased tree

**Files:**
- Modify: `bun.lock`
- Test: package manifest, Git conflict state, db/services tests, Svelte type/test checks, monorepo typecheck

**Interfaces:**
- Consumes: a completed rebase with unioned manifests, service rules, and migration metadata
- Produces: an installable, type-checked, tested, merge-clean branch

- [ ] **Step 1: Regenerate the lockfile with the approved package manager**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
bun install
bun install --frozen-lockfile
```

Expected: both commands exit 0 and `bun.lock` reflects `apps/www`, `apps/svelte`, and `packages/ui-svelte` dependencies.

- [ ] **Step 2: Prove Git has no unresolved conflict state or markers**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
test -z "$(git diff --name-only --diff-filter=U)"
! git grep -n -E '^(<<<<<<<|=======|>>>>>>>)' -- ':!bun.lock'
git status --short
```

Expected: no unmerged paths or conflict markers. Only intentional generated/edited files may appear before the resolution commit is created.

- [ ] **Step 3: Run affected database, services, Svelte, and root type checks**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
bun run --filter '@aqsha/db' typecheck
bun run --filter '@aqsha/db' --filter '@aqsha/services' test
bun run typecheck:ui-svelte
bun run typecheck:svelte
bun run test:svelte
bun run typecheck
```

Expected: every command exits 0. If a command fails, use the failure output to repair only the conflict-resolution integration, then rerun the failing command and all checks that cover the changed area.

- [ ] **Step 4: Confirm the PR merge is mechanically clean**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
git merge-tree --write-tree origin/development HEAD
```

Expected: exit 0 with a generated tree object and no `CONFLICT` lines.

- [ ] **Step 5: Commit generated resolution changes if the rebase has not already committed them**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
git status --short
git add package.json bun.lock packages/services packages/db/migrations
git commit -m "chore: rebase svelte migration onto development"
```

Expected: a clean working tree. Do not create an empty commit; if `git status --short` is empty, skip the commit command.

## Task 5: Publish safely and create the PR

**Files:**
- Modify: remote branch `origin/feat/apps-svelte-migration`
- Create: GitHub PR targeting `development`
- Test: GitHub PR metadata and mergeability status

**Interfaces:**
- Consumes: a clean, fully validated rebased branch
- Produces: a review-ready PR from `feat/apps-svelte-migration` to `development`

- [ ] **Step 1: Push the rewritten branch safely**

Run:
```bash
git -C /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration push --force-with-lease origin feat/apps-svelte-migration
```

Expected: the remote branch updates only if it still points to the last fetched value.

- [ ] **Step 2: Create the PR with the exact source and target**

Run:
```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-svelte-migration
gh pr create --base development --head feat/apps-svelte-migration --title "feat: migrate Aqsha app to Svelte" --body $'## Summary\n- rebase the Svelte migration branch onto `development`\n- preserve the `apps/www` waitlist work and the Svelte/Typst/explore/library work\n- sequence Drizzle migrations after `0035_waitlist_entries` and regenerate `bun.lock`\n\n## Validation\n- `bun install --frozen-lockfile`\n- `bun run --filter @aqsha/db typecheck`\n- `bun run --filter @aqsha/db --filter @aqsha/services test`\n- `bun run typecheck:ui-svelte`\n- `bun run typecheck:svelte`\n- `bun run test:svelte`\n- `bun run typecheck`\n- `git merge-tree --write-tree origin/development HEAD`'
```

Expected: GitHub prints the new PR URL.

- [ ] **Step 3: Verify PR target, source, and mergeability**

Run:
```bash
gh pr view --json url,headRefName,baseRefName,mergeStateStatus,isDraft
```

Expected: `headRefName` is `feat/apps-svelte-migration`, `baseRefName` is `development`, `isDraft` is `false`, and GitHub does not report a dirty merge state.
