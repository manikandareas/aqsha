# Explore unified paper shape design

## Goal

Make the curated Explore feed store and return the exact shape a literature search result already has, so that `ExploreSourceRow` renders both from one type and no component performs any mapping.

## Problem

The feed and literature search both originate from OpenAlex, but they travel through two independent normalizations that were written at different times and agree on nothing:

| | Curated feed (Jelajah) | Literature results |
| --- | --- | --- |
| OpenAlex `select` | `OPENALEX_SELECT_FIELDS` (`feed/openAlex.ts`) | `LITERATURE_WORK_SELECT` (`literature-search/openalex.ts`) |
| Mapper | `openAlexWorkToExplorePaper` → `ExplorePaperInput` | `mapOpenAlexWork` → `LiteraturePaper` |
| Persisted | `explore_papers` + `feed_items` | not persisted (live per request) |
| Wire type | `FeedItemResponse` (26 fields) | `LiteraturePaper` (18 fields) |
| Frontend adapter | `discoveryItemToExploreSource()` | `literaturePaperToExploreSource()` |

`ExploreSource` and its two adapters are the symptom. The cause is that `feed_items` never stores `publicationDate`, `oaStatus`, `workType`, or `language`, and names the fields it does store differently (`summary` vs `snippet`, `retraction_status` vs `isRetracted`).

There is a third lossy hop that neither table makes obvious. `LiteratureSearchService.search` writes its results into the shared paper cache through `toExplorePaperInput`, which drops `oaStatus`, `workType`, `language`, `isRetracted`, and `hasPdf`. When a user saves a search result, `ensureFeedItemForPaperKey` reads that degraded row back out of `explore_papers` and materializes a feed row poorer than the search result it came from. Patching `feed_items` alone would leave this hole open.

## Scope

- One shared OpenAlex `select` list and one shared work mapper for feed and search.
- `feed_items` restructured to mirror `LiteraturePaper`, with legacy news-era columns dropped.
- `explore_papers` extended so the save-from-search path stops losing fields.
- `GET /feed` returns `LiteraturePaper & { feedItemId }`.
- `ExploreSource` and both frontend adapters deleted; dead discovery-model code removed.
- Cross-kind ranking machinery simplified now that the feed serves one kind.

Out of scope: changing OpenAlex query semantics or ranking weights, changing save/hide behavior, the paper reader (`/app/explore/[paperRef]`, `GET /papers/detail`), and project-scoped paper search (`usePaperSearch`).

## Decisions taken

- **Depth**: changes reach storage, not just the wire or the component layer.
- **`apps/web`**: the response shape changes without a compatibility layer. `apps/web` keeps consuming `GET /feed`, `/feed/home`, `/feed/:id`, and `/feed/:id/related` in `features/discovery/api.ts`, `features/explore/components/explore-findings.tsx`, and `features/discovery/components/home-explore-bento.tsx`, and **will break**. This is accepted deliberately; `apps/web` is not updated as part of this work.
- **Wire shape**: exactly `LiteraturePaper` plus `feedItemId`. Ranking signals (`relevanceScore`, `reason`), `saved`, and every news-era field leave the response.
- **Migration**: destructive. Legacy rows and dead columns are removed rather than left in place. This cannot be rolled back on production.

## Canonical model

`LiteraturePaper` and `mapOpenAlexWork()` move from `literature-search/` into a shared leaf module, `packages/services/src/papers/work.ts`. The move exists to keep module boundaries honest: `feed/` and `literature-search/` are siblings, so neither may import from the other, and both now need the same normalization. `LITERATURE_WORK_SELECT` moves with them and becomes the only OpenAlex `select` list in the codebase — this is what actually guarantees feed and search receive identical fields from upstream.

The type keeps the name `LiteraturePaper`. It remains accurate for feed rows, and renaming it would touch a dozen files across both packages without adding clarity.

Four functions are deleted outright. Together they are the entire lossy surface:

- `feed/openAlex.ts: openAlexWorkToExplorePaper`
- `feed/model.ts: paperToFeedInput`
- `feed/model.ts: deriveSearchText`
- `literature-search/service.ts: toExplorePaperInput`

Two non-lossy helpers replace them in `papers/work.ts`:

- `literaturePaperToExplorePaper(paper): NewExplorePaper`
- `explorePaperToLiteraturePaper(row): LiteraturePaper`

## Schema

### `feed_items`

After the migration the table is `LiteraturePaper` plus a small machine header.

Machine columns retained:

| Column | Role |
| --- | --- |
| `id` (text, PK) | feed row identity; the `feedItemId` on the wire |
| `kind` (text) | CHECK narrowed to `'paper'` |
| `dedupe_key` (text, unique) | `paper:{key}`, idempotent upsert handle |
| `order_at` (bigint) | total sort key for the keyset scan |
| `published_at` (bigint) | parsed from `publication_date`, feeds `order_at` and recency |
| `trend_score` (double) | `cited_by_count ?? 0`, backs `feed_items_by_kind_trend` |
| `last_seen_at`, `created_at` (bigint) | upsert bookkeeping |

Paper columns, one per `LiteraturePaper` field:

`key` (renamed from `paper_key`, now `not null`), `title`, `snippet` (renamed from `summary`, now nullable), `doi`, `url` (now nullable), `pdf_url`, `has_pdf`, `authors[]`, `year`, `publication_date`, `venue`, `cited_by_count`, `is_open_access`, `oa_status`, `work_type`, `language`, `is_retracted` (replaces `retraction_status`), `topics[]`.

`url` and `snippet` become nullable because `LiteraturePaper` declares them `string | null`; keeping them `not null` would force a coercion and reintroduce a lossy hop.

Columns dropped: `summary` (renamed), `tldr`, `tldr_id`, `title_id`, `resolved_url`, `image_url`, `article_text`, `enrich_attempts`, `provider`, `source_label`, `retraction_status` (replaced), `primary_claim`, `stance_supporting`, `stance_contrasting`, `sparkline`, `search_text`, `search_tsv`.

Index changes: `feed_items_by_paper_key` renamed to `feed_items_by_key`; `feed_items_search_gin` dropped with its generated column. `feed_items_by_order`, `feed_items_by_kind_trend`, `feed_items_by_kind_published`, and `feed_items_by_dedupe_key` are untouched.

### `explore_papers`

Additive only: `oa_status`, `work_type`, `language`, `is_retracted`. `snippet` widens from `not null` to nullable so a null-abstract paper survives the round trip. The frontend already tolerates this — `PaperReader.svelte:119` reads `paper.abstract ?? paper.snippet ?? ''` and `SourceResultCard.svelte:46` guards with `{#if paper.snippet}` — so only the `ExplorePaper` type widens.

### Migration order

The three interaction tables reference `feed_items.id` **without** `onDelete: cascade` (`feedInteractions.ts:19`, `hiddenFeedItems.ts:18`, `savedFeedItems.ts:18`). Deleting legacy rows before clearing their dependants fails on the foreign key, so the order is fixed:

Two classes of row cannot survive: `kind <> 'paper'`, and `paper_key is null` (the renamed `key` column is `not null`, and a paper row that never resolved a key would block the constraint). Both classes must lose their dependants before they are deleted, so they are handled together:

1. Delete rows in `feed_interactions`, `hidden_feed_items`, and `saved_feed_items` whose `feed_item_id` points at a `feed_items` row with `kind <> 'paper' or paper_key is null`.
2. Delete `feed_items` rows matching the same predicate.
3. Rename, drop, and add columns; narrow the `kind` CHECK; rename the index.
4. Backfill the four new columns on surviving rows by running `FeedHydrationService.refreshTrendingPapers`. Rows the refresh does not cover keep nulls, which the UI already renders as absent.

Step 1 discards a user's saved and hidden marks for those rows. That is unavoidable given the foreign keys, and acceptable because every affected row is legacy news or an unresolvable paper that the UI has not rendered since news was dropped.

Migration files live in `packages/db/migrations`.

## Write paths

`buildFeedItemRow(paper: LiteraturePaper, now: number)` becomes the single row constructor and the only place derivations happen. It mints `id`, sets `kind: 'paper'` and `dedupeKey: paper:{key}`, parses `publishedAt` from `publicationDate`, derives `orderAt` (`publishedAt ?? lastSeenAt ?? createdAt`, unchanged), and sets `trendScore` from `citedByCount`. The 32-field `FeedItemInput` type disappears; the input is `LiteraturePaper` as-is. `upsertFeedItems` in `feed/write.ts` remains the sole write funnel.

| Writer | Before | After |
| --- | --- | --- |
| `FeedHydrationService.refreshTrendingPapers` | `openAlexWorkToExplorePaper` → `paperToFeedInput` | `mapOpenAlexWork` → row |
| `ensureFeedItemForPaperKey` (save from search) | reads `explore_papers` → `paperToFeedInput` (lossy) | reads `explore_papers` → `explorePaperToLiteraturePaper` |
| `LiteratureSearchService.search` | `toExplorePaperInput` (drops 5 fields) | `literaturePaperToExplorePaper` |

`feed/openAlex.ts` keeps its own trending URL builder. `buildLiteratureWorksUrl` always writes a `search` parameter, which cannot express the trending query (empty search, `sort=cited_by_count:desc`, `from_publication_date` floor). Only the `select` list and the mapper are shared, and those are what determine field parity. The feed continues to fetch with `includeRetracted: true` so retracted papers can carry their badge rather than vanish.

## Read path

`shapeFeedItem(row): LiteraturePaper & { feedItemId }`. The `extra` parameter disappears along with its consumers. `GET /feed` returns `{ items, nextCursor }`; `GET /feed/home`, `/feed/:id`, and `/feed/:id/related` return the same item shape.

Because the feed now serves a single kind, the cross-kind machinery collapses:

- `FeedRepo.paginateBalanced` (two interleaved keyset lanes for paper↔news) is replaced by a plain `by_order` keyset scan.
- `kindBoost()` and `deClump()` are removed from `feed/ranking.ts`; with one kind they are a constant and a no-op.
- The `kind !== "news"` guards in `FeedService.getFeed`, `getFeedPaginated`, `getFeedItem`, and `getRelatedFeedItems` are removed, since the CHECK constraint now enforces what they were filtering.

Result ordering shifts slightly: no more alternation between kinds, which no longer applied anyway. Interest, recency, and popularity weights are unchanged.

`context.service.ts` requires a matching change. Its `wantFeedItems` branch filters results with `f.kind === "news"` (line 131), but `getFeedItem` already returns `null` for news, so `validFeedItems` is always empty — the branch has been dead since news was dropped. `kind` also leaves the response shape, so the filter would no longer typecheck. Removed: the `wantFeedItems` collection (line 67), its `Promise.all` fetch (line 105), the `validFeedItems` filter (line 131), and the two consumers at lines 172 and 179. `input.feedItemIds` stays in the context contract and is ignored; the echoed `feedItemIds` in the response becomes a constant empty array, which is what it already resolves to today.

## Frontend

`apps/svelte` consumes `LiteraturePaper` directly on both paths. The type already exists locally at `explore/literature-search-types.ts` and stays there — `apps/svelte` must not import `@aqsha/services`. The feed adds `type FeedPaper = LiteraturePaper & { feedItemId: string }`.

Deleted:

- `explore/explore-source.ts` in full. `exploreSourceToSearchInput` moves to `literature-search-types.ts` as `literaturePaperToSearchInput(paper)`.
- `discovery/model.ts` and `discovery/model.spec.ts`. Once `feedItemToDiscoveryItem` is gone the file has no live consumers: `paperToDiscoveryItem` is already unreferenced, and its only other importers are dead code.
- `discovery/components/PaperCover.svelte` — unreferenced.
- `discovery/format.ts: buildSourceLine` — unreferenced. `formatCitationCount` stays; `ExploreSourceRow` and `PaperReader` use it.
- From `discovery/types.ts`: `FeedItem`, `FeedKind`, `KIND_LABELS`, `feedItemHref`. `ExplorePaper`, `PaperEnrichment*`, `DiscoveryItemRef`, `FeedMode`, `FeedTopic`, and `FEED_TOPIC_LABELS` stay — the paper reader and `ProjectSearchPage` still need them.

`ExploreSourceRow` takes `LiteraturePaper` and computes its own link from `key` (`/app/explore/{encodeURIComponent(key)}`). The external-link branch goes away: feed rows always carry a key now, so every row is internal. `summary` becomes `snippet`, and `isRetracted`, `hasPdf`, `topics`, `isOpenAccess`, `citedByCount`, `authors`, `year`, and `venue` are read straight off the item.

`ExploreFindings` and `LiteratureResults` pass query items through untouched. Both key their lists by `key`. `ExploreFindings` builds `{ kind: 'feed', feedItemId }` at the two call sites that hide or record an interaction.

One visible consequence: feed rows previously showed `tldr` (first sentence, ≤220 chars) and will now show `snippet` (abstract excerpt, ≤1200 chars, clamped to three lines) — the same body literature results already show. This is intended; it is what "same shape" means at the presentation layer.

## Testing

Existing suites that must move with the change:

- `packages/services/test/feed-model.test.ts` — row constructor signature and derivations.
- `packages/services/test/feed-openalex.test.ts`, `feed-providers.test.ts` — mapper replaced.
- `packages/services/test/feed-service.test.ts`, `feed-ranking.test.ts` — cross-kind machinery removed.
- `packages/services/test/feed-interaction.test.ts` — materialization path.
- `packages/services/test/literature-search-service.test.ts` — cache write helper replaced.
- `packages/db/test/feed.test.ts` — columns and repo queries.
- `apps/api/test/feed.test.ts` — response shape.

One new test carries the actual contract: a single `OpenAlexWork` fixture pushed through the feed hydration path and through the literature search path must produce objects that satisfy `toEqual`. If that assertion holds, no component can need a mapper.

Gates: `bun run typecheck`, `bun run test`, and `cd apps/svelte && bun run check`. `@aqsha/web` typecheck already fails on `development` and stays failing; it is a known baseline and this change adds to it by design.

## Follow-up, not in this work

`feed_items` and `explore_papers` both store the full paper after this change. That duplication is deliberate and predates this work — the schema comment states the feed is denormalized so cards render without a join. Collapsing them (making `explore_papers` the sole owner and reducing `feed_items` to `id`, `key`, `trend_score`, `order_at`, `published_at`, `dedupe_key`, `last_seen_at`, read through a join) would remove it, but reaches the paper reader, `GET /papers/detail`, `PaperCacheService`, and every ranking query. Worth doing separately if the duplication starts to cost something.
