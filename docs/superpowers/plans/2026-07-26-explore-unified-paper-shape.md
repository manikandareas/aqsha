# Explore Unified Paper Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the curated Explore feed store and return exactly the shape a literature search result has, so `ExploreSourceRow` renders both from one type and no component maps anything.

**Architecture:** One OpenAlex `select` list and one work mapper (`packages/services/src/papers/work.ts`) feed both surfaces. `feed_items` is restructured into a mirror of `LiteraturePaper` plus a small machine header; `explore_papers` gains the four fields it was dropping. `GET /feed` returns `LiteraturePaper & { feedItemId }`, and the frontend deletes `ExploreSource` and both adapters.

**Tech Stack:** Bun 1.3.10, TypeScript, Drizzle ORM + Postgres, Elysia, SvelteKit 5 (runes), TanStack Query, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-07-26-explore-unified-paper-shape-design.md`

## Global Constraints

- Package manager is **`bun`** only. Never npm, pnpm, or yarn.
- `apps/svelte` must **not** import `@aqsha/db` or `@aqsha/services`. It keeps its own local copy of the `LiteraturePaper` type.
- `packages/services/src/feed/` and `packages/services/src/literature-search/` are siblings and must **not** import from each other. Shared code lives in `packages/services/src/papers/`.
- `upsertFeedItems` in `feed/write.ts` stays the **only** write path into `feed_items`; `buildFeedItemRow` stays its only row constructor.
- Comments explain **why**, never what. No references to this plan, task numbers, phases, or ticket IDs in shipped code. Comments in `packages/*` and `apps/api` are written in Indonesian to match surrounding files; comments in `apps/svelte` are written in English to match surrounding files.
- Copy shown to users is sentence case, Indonesian.
- `@aqsha/web` typecheck already fails on `development`. It is a known baseline, is **not** fixed here, and is expected to gain new errors from this work by design.
- Migrations live in `packages/db/migrations` and are hand-authored with a matching `meta/_journal.json` entry. The migrator applies by `when > max(applied)`; never edit the `when` of an existing entry.

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `packages/services/src/papers/work.ts` | Canonical `LiteraturePaper` type, OpenAlex `select` list, `mapOpenAlexWork`, and the two non-lossy converters to/from `explore_papers`. |
| `packages/services/test/papers-work.test.ts` | Mapper and converter unit tests, plus the feed↔search parity contract. |
| `packages/db/migrations/0047_explore_papers_literature_fields.sql` | Additive `explore_papers` columns; widen `snippet`. |
| `packages/db/migrations/0048_feed_items_literature_shape.sql` | Purge legacy rows, restructure `feed_items`. |

**Modified**

| Path | Change |
| --- | --- |
| `packages/db/src/schema/explorePapers.ts` | Four new columns; `snippet` nullable. |
| `packages/db/src/schema/feedItems.ts` | Rewritten as the `LiteraturePaper` mirror. |
| `packages/db/src/repositories/feedRepo.ts` | Drop balanced-lane pagination and news-enrichment queries; rename `paperKey` usage. |
| `packages/services/src/explore/model.ts` | `ExplorePaperInput` gains four fields; `snippet` nullable. |
| `packages/services/src/paper-cache.service.ts` | `toDetail` row shape follows the schema. |
| `packages/services/src/literature-search/types.ts` | Re-export `LiteraturePaper` from the shared module. |
| `packages/services/src/literature-search/openalex.ts` | Re-export mapper/select from the shared module. |
| `packages/services/src/literature-search/service.ts` | `toExplorePaperInput` deleted. |
| `packages/services/src/feed/model.ts` | `buildFeedItemRow(LiteraturePaper)`, `shapeFeedItem → FeedPaper`. |
| `packages/services/src/feed/openAlex.ts` | Keeps the trending URL builder; mapper deleted. |
| `packages/services/src/feed/write.ts` | Input type follows the model. |
| `packages/services/src/feed/ranking.ts` | `kindBoost`, `deClump`, `reasonFor` deleted. |
| `packages/services/src/feed-hydration.service.ts` | Uses the shared mapper. |
| `packages/services/src/feed-interaction.service.ts` | Materializes through `explorePaperToLiteraturePaper`. |
| `packages/services/src/feed.service.ts` | Plain keyset pagination; ranking simplified. |
| `packages/services/src/context.service.ts` | Dead `wantFeedItems` branch removed. |
| `packages/services/src/index.ts` | Export surface follows. |
| `apps/api/src/routes/feed.ts` | `kinds` parameter removed. |
| `apps/svelte/src/lib/features/explore/literature-search-types.ts` | Adds `FeedPaper`, `literaturePaperToSearchInput`. |
| `apps/svelte/src/lib/features/discovery/{types,query-options,format}.ts` | Feed types replaced; dead helper removed. |
| `apps/svelte/src/lib/features/explore/components/{ExploreSourceRow,ExploreFindings,LiteratureResults}.svelte` | Consume `LiteraturePaper` directly. |

**Deleted**

`packages/services/src/feed/model.ts:paperToFeedInput`, `:deriveSearchText`; `packages/services/src/feed/openAlex.ts:openAlexWorkToExplorePaper`; `packages/services/src/literature-search/service.ts:toExplorePaperInput`; `apps/svelte/src/lib/features/explore/explore-source.ts`; `apps/svelte/src/lib/features/discovery/model.ts`; `apps/svelte/src/lib/features/discovery/model.spec.ts`; `apps/svelte/src/lib/features/discovery/components/PaperCover.svelte`.

---

### Task 1: Extend `explore_papers` so the paper cache stops dropping fields

`LiteratureSearchService.search` writes every search result into `explore_papers`, and `ensureFeedItemForPaperKey` reads it back when a user saves one. The table has no home for `oaStatus`, `workType`, `language`, or `isRetracted`, so those four fields are lost on the way in. Widen the table first; everything downstream depends on it.

**Files:**
- Create: `packages/db/migrations/0047_explore_papers_literature_fields.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/explorePapers.ts:13-44`
- Modify: `packages/services/src/explore/model.ts:16-36`
- Modify: `packages/services/src/paper-cache.service.ts:25-70`

**Interfaces:**
- Produces: `ExplorePaperInput` gains `oaStatus?: string`, `workType?: string`, `language?: string`, `isRetracted?: boolean`, and its `snippet` becomes `string | null`. Task 2's `literaturePaperToExplorePaper` and `explorePaperToLiteraturePaper` read and write exactly these.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/test/feed.test.ts`, at the end of the file:

```ts
describe("explore_papers literature fields", () => {
  itest("menyimpan dan membaca kembali oaStatus/workType/language/isRetracted", async () => {
    const db = createDb(DATABASE_URL!);
    const key = `doi:10.9999/exp-${suffix}`;
    await PaperCacheRepo.upsertMany(db, [
      {
        key,
        title: "Paper uji",
        snippet: null,
        url: "https://example.org/a",
        provider: "OpenAlex",
        sourceLabel: "OpenAlex",
        authors: ["A"],
        topics: [],
        oaStatus: "gold",
        workType: "article",
        language: "en",
        isRetracted: true,
        lastSeenAt: Date.now(),
      },
    ]);
    const row = await PaperCacheRepo.getByKey(db, key);
    expect(row?.oaStatus).toBe("gold");
    expect(row?.workType).toBe("article");
    expect(row?.language).toBe("en");
    expect(row?.isRetracted).toBe(true);
    expect(row?.snippet).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/db && bun test test/feed.test.ts -t "oaStatus"
```

Expected: FAIL — TypeScript rejects `oaStatus` as an unknown property on the insert row, and `snippet: null` is not assignable.

- [ ] **Step 3: Write the migration**

Create `packages/db/migrations/0047_explore_papers_literature_fields.sql`:

```sql
ALTER TABLE "explore_papers" ADD COLUMN "oa_status" text;--> statement-breakpoint
ALTER TABLE "explore_papers" ADD COLUMN "work_type" text;--> statement-breakpoint
ALTER TABLE "explore_papers" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "explore_papers" ADD COLUMN "is_retracted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "explore_papers" ALTER COLUMN "snippet" DROP NOT NULL;
```

- [ ] **Step 4: Register the migration**

In `packages/db/migrations/meta/_journal.json`, add this object to the end of the `entries` array, after the `0045_typst_proposal_resubmit` entry:

```json
    {
      "idx": 46,
      "version": "7",
      "when": 1784808000000,
      "tag": "0047_explore_papers_literature_fields",
      "breakpoints": true
    }
```

- [ ] **Step 5: Update the schema**

In `packages/db/src/schema/explorePapers.ts`, change `snippet` and add the four columns. Replace lines 16-35 (the column block) with:

```ts
    key: text("key").primaryKey(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    abstract: text("abstract"),
    url: text("url").notNull(),
    pdfUrl: text("pdf_url"),
    doi: text("doi"),
    arxivId: text("arxiv_id"),
    openalexId: text("openalex_id"),
    provider: text("provider").notNull(),
    sourceLabel: text("source_label").notNull(),
    authors: text("authors").array().notNull().default(sql`'{}'`),
    year: integer("year"),
    publicationDate: text("publication_date"),
    venue: text("venue"),
    citedByCount: integer("cited_by_count"),
    isOpenAccess: boolean("is_open_access"),
    oaStatus: text("oa_status"),
    workType: text("work_type"),
    language: text("language"),
    isRetracted: boolean("is_retracted").notNull().default(false),
    topics: text("topics").array().notNull().default(sql`'{}'`),
    score: doublePrecision("score"),
    lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
```

- [ ] **Step 6: Widen `ExplorePaperInput`**

In `packages/services/src/explore/model.ts`, replace the `ExplorePaperInput` type (lines 16-36) with:

```ts
export type ExplorePaperInput = {
  key: string;
  title: string;
  snippet: string | null;
  abstract?: string;
  url: string;
  pdfUrl?: string;
  doi?: string;
  arxivId?: string;
  openalexId?: string;
  provider: ExploreProvider;
  sourceLabel: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  oaStatus?: string;
  workType?: string;
  language?: string;
  isRetracted?: boolean;
  topics: string[];
  score?: number;
};
```

- [ ] **Step 7: Follow the row shape in `PaperCacheService`**

In `packages/services/src/paper-cache.service.ts`, change `toDetail`'s parameter type: `snippet: string` becomes `snippet: string | null`, and add these four entries after `isOpenAccess: boolean | null;`:

```ts
  oaStatus: string | null;
  workType: string | null;
  language: string | null;
  isRetracted: boolean;
```

Then in the returned object, after `isOpenAccess: o(row.isOpenAccess),`, add:

```ts
    oaStatus: o(row.oaStatus),
    workType: o(row.workType),
    language: o(row.language),
    isRetracted: row.isRetracted,
```

- [ ] **Step 8: Apply the migration and run the test**

```bash
bun run db:migrate
cd packages/db && bun test test/feed.test.ts -t "oaStatus"
```

Expected: PASS.

- [ ] **Step 9: Verify nothing else regressed**

```bash
bun run typecheck
```

Expected: no new errors in `@aqsha/db` or `@aqsha/services`. `@aqsha/web` errors are the known baseline.

- [ ] **Step 10: Commit**

```bash
git add packages/db packages/services/src/explore/model.ts packages/services/src/paper-cache.service.ts
git commit -m "feat(db): give explore_papers the literature fields it was dropping"
```

---

### Task 2: Create the shared OpenAlex work module

Feed and search each own an OpenAlex `select` list and a mapper. Move the literature-search pair into a neutral leaf both may import, and add the two converters that make the paper cache round-trip lossless.

**Files:**
- Create: `packages/services/src/papers/work.ts`
- Create: `packages/services/test/papers-work.test.ts`
- Modify: `packages/services/src/literature-search/types.ts:144-163`
- Modify: `packages/services/src/literature-search/openalex.ts:1-172`
- Modify: `packages/services/src/index.ts:212-228`

**Interfaces:**
- Consumes: `ExplorePaperInput` from Task 1.
- Produces:
  - `LiteraturePaper` — 18 fields, unchanged in shape from its current definition.
  - `LITERATURE_WORK_SELECT: string`
  - `OpenAlexWorkPayload` — the raw work type.
  - `mapOpenAlexWork(work: OpenAlexWorkPayload): LiteraturePaper | null`
  - `literaturePaperToExplorePaper(paper: LiteraturePaper): ExplorePaperInput`
  - `explorePaperToLiteraturePaper(row: ExplorePaperCacheRow): LiteraturePaper`
  - `type ExplorePaperCacheRow` — the subset of `explore_papers` the converter reads.

- [ ] **Step 1: Write the failing test**

Create `packages/services/test/papers-work.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  explorePaperToLiteraturePaper,
  literaturePaperToExplorePaper,
  mapOpenAlexWork,
  type LiteraturePaper,
  type OpenAlexWorkPayload,
} from "../src/papers/work";

const WORK: OpenAlexWorkPayload = {
  id: "https://openalex.org/W1",
  ids: { openalex: "https://openalex.org/W1", doi: "https://doi.org/10.1234/AbC" },
  display_name: "Deep Learning for Climate",
  publication_year: 2023,
  publication_date: "2023-04-01",
  cited_by_count: 42,
  type: "article",
  language: "en",
  is_retracted: false,
  abstract_inverted_index: { Sebuah: [0], studi: [1] },
  open_access: { is_oa: true, oa_status: "gold", oa_url: "https://oa.example/x.pdf" },
  best_oa_location: { pdf_url: "https://oa.example/x.pdf", source: { display_name: "Nature" } },
  authorships: [{ author: { display_name: "Ada Lovelace" } }],
  primary_topic: { display_name: "Climate", field: { display_name: "Earth" } },
};

describe("mapOpenAlexWork", () => {
  test("memetakan work jadi LiteraturePaper lengkap", () => {
    const paper = mapOpenAlexWork(WORK)!;
    expect(paper.key).toBe("doi:10.1234/abc");
    expect(paper.title).toBe("Deep Learning for Climate");
    expect(paper.doi).toBe("10.1234/abc");
    expect(paper.year).toBe(2023);
    expect(paper.publicationDate).toBe("2023-04-01");
    expect(paper.venue).toBe("Nature");
    expect(paper.citedByCount).toBe(42);
    expect(paper.isOpenAccess).toBe(true);
    expect(paper.oaStatus).toBe("gold");
    expect(paper.workType).toBe("article");
    expect(paper.language).toBe("en");
    expect(paper.isRetracted).toBe(false);
    expect(paper.hasPdf).toBe(true);
    expect(paper.authors).toEqual(["Ada Lovelace"]);
    expect(paper.topics).toEqual(["Climate", "Earth"]);
  });

  test("work tanpa judul ditolak", () => {
    expect(mapOpenAlexWork({ id: "https://openalex.org/W2" })).toBeNull();
  });
});

describe("konversi cache paper", () => {
  test("LiteraturePaper bolak-balik lewat explore_papers tanpa kehilangan field", () => {
    const paper = mapOpenAlexWork(WORK)!;
    const cached = literaturePaperToExplorePaper(paper);
    const back = explorePaperToLiteraturePaper({
      key: cached.key,
      title: cached.title,
      snippet: cached.snippet,
      url: cached.url,
      pdfUrl: cached.pdfUrl ?? null,
      doi: cached.doi ?? null,
      authors: cached.authors,
      year: cached.year ?? null,
      publicationDate: cached.publicationDate ?? null,
      venue: cached.venue ?? null,
      citedByCount: cached.citedByCount ?? null,
      isOpenAccess: cached.isOpenAccess ?? null,
      oaStatus: cached.oaStatus ?? null,
      workType: cached.workType ?? null,
      language: cached.language ?? null,
      isRetracted: cached.isRetracted ?? false,
      topics: cached.topics,
    });
    expect(back).toEqual(paper);
  });

  test("paper tanpa url memakai doi sebagai alamat cache", () => {
    const paper: LiteraturePaper = { ...mapOpenAlexWork(WORK)!, url: null };
    expect(literaturePaperToExplorePaper(paper).url).toBe("https://doi.org/10.1234/abc");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/services && bun test test/papers-work.test.ts
```

Expected: FAIL — `Cannot find module '../src/papers/work'`.

- [ ] **Step 3: Create the shared module**

Create `packages/services/src/papers/work.ts`:

```ts
/**
 * Normalisasi kanonik OpenAlex work → paper. Lane feed dan pencarian literatur membaca daftar
 * `select` yang sama dan melewati mapper yang sama, jadi satu paper tampak identik dari surface
 * mana pun ia datang. Leaf module: `feed/` dan `literature-search/` sejajar dan tak boleh saling
 * impor, jadi milik bersama tinggal di sini.
 */
import { canonicalPaperKey, type ExplorePaperInput } from "../explore/model";
import { collapse, firstNonEmpty, numberOrUndefined, uniqueCompact } from "../lib/text";
import { normalizeDoi } from "./identifiers";
import { reconstructOpenAlexAbstract } from "./providers";

/** Satu-satunya daftar `select` OpenAlex — inilah yang menjamin feed dan search dapat field sama. */
export const LITERATURE_WORK_SELECT = [
  "id",
  "ids",
  "display_name",
  "title",
  "doi",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "type",
  "language",
  "is_retracted",
  "abstract_inverted_index",
  "open_access",
  "best_oa_location",
  "primary_location",
  "authorships",
  "primary_topic",
  "topics",
].join(",");

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  source?: { display_name?: string | null } | null;
};

type OpenAlexTopic = {
  display_name?: string | null;
  field?: { display_name?: string | null } | null;
  subfield?: { display_name?: string | null } | null;
};

export type OpenAlexWorkPayload = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  cited_by_count?: number | null;
  type?: string | null;
  language?: string | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: {
    is_oa?: boolean | null;
    oa_status?: string | null;
    oa_url?: string | null;
  } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
  }> | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  ids?: { openalex?: string | null; doi?: string | null } | null;
};

/** Bentuk paper bersama feed dan hasil pencarian. Tak ada bentuk lain di jalur mana pun. */
export type LiteraturePaper = {
  key: string;
  title: string;
  snippet: string | null;
  doi: string | null;
  url: string | null;
  pdfUrl: string | null;
  hasPdf: boolean;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean;
  oaStatus: string | null;
  workType: string | null;
  language: string | null;
  isRetracted: boolean;
  topics: string[];
};

export function mapOpenAlexWork(work: OpenAlexWorkPayload): LiteraturePaper | null {
  const title = collapse(work.display_name ?? work.title ?? "");
  if (!title) return null;

  const openalexId = work.ids?.openalex ?? work.id ?? null;
  const doi = normalizeDoi(work.ids?.doi ?? work.doi ?? "") || null;
  const location = work.best_oa_location ?? work.primary_location ?? null;
  const pdfUrl = firstNonEmpty(work.best_oa_location?.pdf_url, location?.pdf_url) || null;
  const url =
    firstNonEmpty(
      work.open_access?.oa_url,
      location?.landing_page_url,
      doi ? `https://doi.org/${doi}` : null,
      openalexId,
    ) || null;

  const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);
  const topics = uniqueCompact([
    work.primary_topic?.display_name,
    work.primary_topic?.subfield?.display_name,
    work.primary_topic?.field?.display_name,
    ...(work.topics ?? []).map((topic) => topic.display_name),
  ]).slice(0, 5);

  return {
    key: canonicalPaperKey({
      doi: doi ?? undefined,
      url: url ?? undefined,
      locator: openalexId ?? undefined,
      title,
    }),
    title,
    snippet: abstract ? abstract.slice(0, 1200) : topics.length > 0 ? topics.join(", ") : null,
    doi,
    url,
    pdfUrl,
    hasPdf: Boolean(pdfUrl),
    authors: (work.authorships ?? [])
      .map((authorship) =>
        collapse(authorship.author?.display_name ?? authorship.raw_author_name ?? ""),
      )
      .filter(Boolean)
      .slice(0, 8),
    year: numberOrUndefined(work.publication_year) ?? null,
    publicationDate: work.publication_date ?? null,
    venue: collapse(location?.source?.display_name ?? "") || null,
    citedByCount: numberOrUndefined(work.cited_by_count) ?? null,
    isOpenAccess: Boolean(work.open_access?.is_oa),
    oaStatus: work.open_access?.oa_status ?? null,
    workType: work.type ?? null,
    language: work.language ?? null,
    isRetracted: Boolean(work.is_retracted),
    topics,
  };
}

/** Kolom `explore_papers` yang dibaca converter (baris Drizzle memenuhi bentuk ini). */
export type ExplorePaperCacheRow = {
  key: string;
  title: string;
  snippet: string | null;
  url: string | null;
  pdfUrl: string | null;
  doi: string | null;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean | null;
  oaStatus: string | null;
  workType: string | null;
  language: string | null;
  isRetracted: boolean;
  topics: string[];
};

/**
 * Paper → baris cache. `url` NOT NULL di `explore_papers`, jadi paper tanpa alamat jatuh ke DOI
 * lalu ke key — satu-satunya field yang tak identik bolak-balik, dan paper tanpa alamat mana pun
 * memang tak bisa dibuka reader.
 */
export function literaturePaperToExplorePaper(paper: LiteraturePaper): ExplorePaperInput {
  const openalexId = paper.key.startsWith("url:https://openalex.org/")
    ? paper.key.slice("url:".length)
    : undefined;
  return {
    key: paper.key,
    title: paper.title,
    snippet: paper.snippet,
    abstract: paper.snippet ?? undefined,
    url: paper.url ?? (paper.doi ? `https://doi.org/${paper.doi}` : paper.key),
    pdfUrl: paper.pdfUrl ?? undefined,
    doi: paper.doi ?? undefined,
    openalexId,
    provider: "OpenAlex",
    sourceLabel: paper.venue ?? "OpenAlex",
    authors: paper.authors,
    year: paper.year ?? undefined,
    publicationDate: paper.publicationDate ?? undefined,
    venue: paper.venue ?? undefined,
    citedByCount: paper.citedByCount ?? undefined,
    isOpenAccess: paper.isOpenAccess,
    oaStatus: paper.oaStatus ?? undefined,
    workType: paper.workType ?? undefined,
    language: paper.language ?? undefined,
    isRetracted: paper.isRetracted,
    topics: paper.topics,
  };
}

export function explorePaperToLiteraturePaper(row: ExplorePaperCacheRow): LiteraturePaper {
  return {
    key: row.key,
    title: row.title,
    snippet: row.snippet,
    doi: row.doi,
    url: row.url,
    pdfUrl: row.pdfUrl,
    hasPdf: Boolean(row.pdfUrl),
    authors: row.authors,
    year: row.year,
    publicationDate: row.publicationDate,
    venue: row.venue,
    citedByCount: row.citedByCount,
    isOpenAccess: Boolean(row.isOpenAccess),
    oaStatus: row.oaStatus,
    workType: row.workType,
    language: row.language,
    isRetracted: row.isRetracted,
    topics: row.topics,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/services && bun test test/papers-work.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Point `literature-search` at the shared module**

In `packages/services/src/literature-search/types.ts`, delete the `LiteraturePaper` type block (lines 144-163) and add this re-export at the top of the file, below the existing imports:

```ts
export type { LiteraturePaper } from "../papers/work";
```

In `packages/services/src/literature-search/openalex.ts`, delete `LITERATURE_WORK_SELECT` (lines 17-36), the `OpenAlexLocation`/`OpenAlexTopic`/`OpenAlexWorkPayload` types (lines 48-87), and `mapOpenAlexWork` (lines 116-172). Replace the `normalizeDoi`/`reconstructOpenAlexAbstract`/`canonicalPaperKey`/`collapse` imports that become unused, leaving the file importing:

```ts
import { contactEmail, fetchWithRetry, userAgent } from "../papers/http";
import { collapse } from "../lib/text";
import {
  LITERATURE_WORK_SELECT,
  mapOpenAlexWork,
  type LiteraturePaper,
  type OpenAlexWorkPayload,
} from "../papers/work";
import { toOpenAlexFilter } from "./catalog";
import type {
  LiteratureAutocompleteItem,
  LiteratureEntityKind,
  LiteratureFilterClause,
  LiteratureSortId,
} from "./types";

export { LITERATURE_WORK_SELECT, mapOpenAlexWork, type OpenAlexWorkPayload };
```

`collapse` stays — `fetchLiteratureAutocomplete` still uses it.

- [ ] **Step 6: Export the shared module from the package**

In `packages/services/src/index.ts`, add after the `literature-search/types` export block:

```ts
export {
  explorePaperToLiteraturePaper,
  type ExplorePaperCacheRow,
  LITERATURE_WORK_SELECT,
  literaturePaperToExplorePaper,
  mapOpenAlexWork,
  type OpenAlexWorkPayload,
} from "./papers/work";
```

Remove `type LiteraturePaper,` from the `./literature-search/types` export block and add it to this new block instead, so the type has exactly one export site.

- [ ] **Step 7: Run the services suite**

```bash
cd packages/services && bun test
```

Expected: PASS. `literature-search-openalex.test.ts` still passes because `mapOpenAlexWork` is re-exported from its old path.

- [ ] **Step 8: Commit**

```bash
git add packages/services/src/papers/work.ts packages/services/test/papers-work.test.ts packages/services/src/literature-search packages/services/src/index.ts
git commit -m "refactor(services): give feed and search one OpenAlex work mapper"
```

---

### Task 3: Stop the search path from degrading what it caches

`LiteratureSearchService.search` maps every result through `toExplorePaperInput`, which silently drops five fields before the cache write. Replace it with the non-lossy converter.

**Files:**
- Modify: `packages/services/src/literature-search/service.ts:83-103,155-159,187`
- Modify: `packages/services/test/literature-search-service.test.ts`

**Interfaces:**
- Consumes: `literaturePaperToExplorePaper` from Task 2.

- [ ] **Step 1: Write the failing test**

Append to `packages/services/test/literature-search-service.test.ts`. This asserts on what `search` actually hands the cache, using the same `spyOn` seam the existing test in this file uses — so it is red until the lossy helper is gone:

```ts
test("direct search meneruskan field oa/type/language ke paper cache", async () => {
  process.env.OPENALEX_API_KEY = "test-key";
  const paper = {
    key: "doi:10.1/x",
    title: "X",
    snippet: "S",
    doi: "10.1/x",
    url: "https://e.org/x",
    pdfUrl: null,
    hasPdf: false,
    authors: ["A"],
    year: 2024,
    publicationDate: "2024-02-02",
    venue: "V",
    citedByCount: 7,
    isOpenAccess: true,
    oaStatus: "hybrid",
    workType: "preprint",
    language: "id",
    isRetracted: true,
    topics: ["t"],
  };
  const fetchWorks = spyOn(literatureSearchDeps, "fetchWorks").mockResolvedValue({
    items: [paper as never],
    total: 1,
    nextCursor: null,
  });
  const upsert = spyOn(PaperCacheService, "upsert").mockResolvedValue(undefined as never);
  spyOn(cache, "getCache").mockResolvedValue(null);
  spyOn(cache, "putCache").mockResolvedValue(undefined);

  try {
    await LiteratureSearchService.search({} as never, {
      query: "climate",
      sort: "relevance",
      filters: [],
      cursor: null,
      limit: 20,
    });
    const cached = upsert.mock.calls[0]![1] as Array<Record<string, unknown>>;
    expect(cached[0]!.oaStatus).toBe("hybrid");
    expect(cached[0]!.workType).toBe("preprint");
    expect(cached[0]!.language).toBe("id");
    expect(cached[0]!.isRetracted).toBe(true);
  } finally {
    fetchWorks.mockRestore();
    upsert.mockRestore();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/services && bun test test/literature-search-service.test.ts -t "meneruskan field"
```

Expected: FAIL — `toExplorePaperInput` never copies those four fields, so each assertion reads `undefined`.

- [ ] **Step 3: Delete the lossy helper**

In `packages/services/src/literature-search/service.ts`, delete `toExplorePaperInput` (lines 83-103) and the now-unused `import type { ExplorePaperInput } from "../explore/model";`. Add:

```ts
import { literaturePaperToExplorePaper } from "../papers/work";
```

Replace both cache writes. Line 155-159 becomes:

```ts
        await PaperCacheService.upsert(db, page.items.map(literaturePaperToExplorePaper), now);
```

Line 187 becomes:

```ts
    await PaperCacheService.upsert(db, page.items.map(literaturePaperToExplorePaper), now);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/services && bun test test/literature-search-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/literature-search/service.ts packages/services/test/literature-search-service.test.ts
git commit -m "fix(services): stop dropping oa/type/language fields when caching search results"
```

---

### Task 4: Restructure `feed_items` into the `LiteraturePaper` mirror

This is the destructive step. Legacy rows are purged, news-era columns are dropped, and `summary`/`retraction_status`/`paper_key` are replaced. `packages/services` will not compile at the end of this task — that is expected, and Task 5 repairs it. The gate here is `packages/db` alone, which has no dependency on services.

**Files:**
- Create: `packages/db/migrations/0048_feed_items_literature_shape.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/feedItems.ts`
- Modify: `packages/db/src/repositories/feedRepo.ts`
- Modify: `packages/db/test/feed.test.ts`

**Interfaces:**
- Produces: `FeedItem` / `NewFeedItem` carrying `key`, `snippet`, `hasPdf`, `publicationDate`, `oaStatus`, `workType`, `language`, `isRetracted`. `FeedRepo.paginateByOrder(db, { limit, cursor: KeysetCursor | null })` becomes the feed's only pagination entry point. `FeedRepo.paginateBalanced`, `mergeBalancedLanes`, `listNewsNeedingEnrichment`, `applyEnrichmentPatch`, `findByPaperKey`, `NewsEnrichmentTarget`, and `EnrichmentPatch` no longer exist.

- [ ] **Step 1: Write the failing test**

In `packages/db/test/feed.test.ts`: delete the `describe("mergeBalancedLanes (pure)")` block (lines 108-124) and the `listNewsNeedingEnrichment` test (lines 213-234), remove `mergeBalancedLanes` from the import on line 5, then append:

```ts
describe("feed_items bentuk LiteraturePaper", () => {
  itest("menyimpan dan membaca kembali seluruh field paper", async () => {
    const db = createDb(DATABASE_URL!);
    const now = Date.now();
    const row = await FeedRepo.upsertByDedupeKey(db, {
      id: `feeditem_${suffix}_shape`,
      kind: "paper",
      key: `doi:10.5555/shape-${suffix}`,
      title: "Bentuk baru",
      snippet: null,
      doi: `10.5555/shape-${suffix}`,
      url: null,
      pdfUrl: "https://e.org/x.pdf",
      hasPdf: true,
      authors: ["A", "B"],
      year: 2025,
      publicationDate: "2025-03-04",
      venue: "Jurnal",
      citedByCount: 12,
      isOpenAccess: true,
      oaStatus: "green",
      workType: "article",
      language: "id",
      isRetracted: true,
      topics: ["x"],
      trendScore: 12,
      publishedAt: now,
      dedupeKey: `paper:doi:10.5555/shape-${suffix}`,
      lastSeenAt: now,
      createdAt: now,
      orderAt: now,
    });
    expect(row.key).toBe(`doi:10.5555/shape-${suffix}`);
    expect(row.snippet).toBeNull();
    expect(row.url).toBeNull();
    expect(row.hasPdf).toBe(true);
    expect(row.publicationDate).toBe("2025-03-04");
    expect(row.oaStatus).toBe("green");
    expect(row.workType).toBe("article");
    expect(row.language).toBe("id");
    expect(row.isRetracted).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/db && bun test test/feed.test.ts -t "bentuk LiteraturePaper"
```

Expected: FAIL — `key`, `snippet`, `hasPdf`, `publicationDate`, `oaStatus`, `workType`, `language`, and `isRetracted` are not properties of `NewFeedItem`.

- [ ] **Step 3: Write the migration**

Create `packages/db/migrations/0048_feed_items_literature_shape.sql`:

```sql
DELETE FROM "feed_interactions" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL);--> statement-breakpoint
DELETE FROM "hidden_feed_items" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL);--> statement-breakpoint
DELETE FROM "saved_feed_items" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL);--> statement-breakpoint
DELETE FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL;--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT "feed_items_kind_check";--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT "feed_items_provider_check";--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT "feed_items_retraction_status_check";--> statement-breakpoint
DROP INDEX IF EXISTS "feed_items_search_gin";--> statement-breakpoint
DROP INDEX IF EXISTS "feed_items_by_paper_key";--> statement-breakpoint
ALTER TABLE "feed_items" RENAME COLUMN "summary" TO "snippet";--> statement-breakpoint
ALTER TABLE "feed_items" RENAME COLUMN "paper_key" TO "key";--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "snippet" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "has_pdf" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "publication_date" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "oa_status" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "work_type" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "is_retracted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "feed_items" SET "has_pdf" = ("pdf_url" IS NOT NULL);--> statement-breakpoint
UPDATE "feed_items" SET "is_retracted" = ("retraction_status" = 'retracted');--> statement-breakpoint
UPDATE "feed_items" SET "authors" = '{}' WHERE "authors" IS NULL;--> statement-breakpoint
UPDATE "feed_items" SET "is_open_access" = false WHERE "is_open_access" IS NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "authors" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "authors" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "is_open_access" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "is_open_access" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "search_tsv";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "search_text";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "tldr";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "tldr_id";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "title_id";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "resolved_url";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "article_text";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "enrich_attempts";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "source_label";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "retraction_status";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "primary_claim";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "stance_supporting";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "stance_contrasting";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "sparkline";--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_kind_check" CHECK ("feed_items"."kind" = 'paper');--> statement-breakpoint
CREATE INDEX "feed_items_by_key" ON "feed_items" USING btree ("key");
```

`search_tsv` is dropped before `search_text` because it is a generated column computed from it.

- [ ] **Step 4: Register the migration**

Add to the end of the `entries` array in `packages/db/migrations/meta/_journal.json`:

```json
    {
      "idx": 47,
      "version": "7",
      "when": 1784808600000,
      "tag": "0048_feed_items_literature_shape",
      "breakpoints": true
    }
```

- [ ] **Step 5: Rewrite the schema**

Replace the whole of `packages/db/src/schema/feedItems.ts` with:

```ts
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * feed_items — cermin bentuk paper hasil pencarian literatur, ditambah header mesin untuk
 * urutan dan dedup. Bentuknya sengaja identik dengan hasil pencarian supaya kartu feed dan
 * kartu hasil dirender komponen yang sama tanpa pemetaan apa pun.
 *
 * - `order_at` bigint NOT NULL → kunci sort total untuk keyset infinite scroll. DIISI
 *   `deriveOrderAt` di SETIAP write.
 * - `key` = ref logis ke `explore_papers.key` (TANPA FK keras; lihat explorePapers.ts).
 * - `trend_score` mengikuti `cited_by_count`; dipisah karena jadi kolom index ranking.
 * - Field paper di-denormalisasi di sini supaya kartu render tanpa join ke explore_papers.
 */
export const feedItems = pgTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    doi: text("doi"),
    url: text("url"),
    pdfUrl: text("pdf_url"),
    hasPdf: boolean("has_pdf").notNull().default(false),
    authors: text("authors").array().notNull().default(sql`'{}'`),
    year: integer("year"),
    publicationDate: text("publication_date"),
    venue: text("venue"),
    citedByCount: integer("cited_by_count"),
    isOpenAccess: boolean("is_open_access").notNull().default(false),
    oaStatus: text("oa_status"),
    workType: text("work_type"),
    language: text("language"),
    isRetracted: boolean("is_retracted").notNull().default(false),
    topics: text("topics").array().notNull().default(sql`'{}'`),
    trendScore: doublePrecision("trend_score").notNull(),
    publishedAt: bigint("published_at", { mode: "number" }),
    dedupeKey: text("dedupe_key").notNull(),
    lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    orderAt: bigint("order_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("feed_items_kind_check", sql`${t.kind} = 'paper'`),
    uniqueIndex("feed_items_by_dedupe_key").on(t.dedupeKey),
    index("feed_items_by_kind_trend").on(t.kind, t.trendScore),
    index("feed_items_by_kind_published").on(t.kind, t.publishedAt),
    index("feed_items_by_order").on(t.orderAt, t.id),
    index("feed_items_by_key").on(t.key),
  ],
);

export type FeedItem = typeof feedItems.$inferSelect;
export type NewFeedItem = typeof feedItems.$inferInsert;
```

- [ ] **Step 6: Trim the repository**

In `packages/db/src/repositories/feedRepo.ts`:

Replace the import block (lines 1-10) with:

```ts
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { encodeKeysetCursor, type KeysetCursor } from "../cursor";
import { type FeedItem, type NewFeedItem, feedItems } from "../schema/feedItems";
import type { DbOrTx } from "../types";
```

Delete `NewsEnrichmentTarget` (lines 12-22) and `EnrichmentPatch` (lines 24-33).

Replace `upsertByDedupeKey` (lines 41-64) with:

```ts
  /**
   * Upsert by `dedupe_key`. On conflict update SEMUA field mutable kecuali `id`+`created_at`
   * (preserve baris asli yang dirujuk saved/hidden FK). Mengembalikan baris hasil.
   */
  async upsertByDedupeKey(db: DbOrTx, row: NewFeedItem): Promise<FeedItem> {
    const { id: _id, createdAt: _createdAt, ...mutable } = row;
    const rows = await db
      .insert(feedItems)
      .values(row)
      .onConflictDoUpdate({ target: feedItems.dedupeKey, set: mutable })
      .returning();
    return rows[0]!;
  },
```

Delete `findByPaperKey` (lines 90-98), `paginateBalanced` (lines 129-166), `listNewsNeedingEnrichment` (lines 188-219), and `applyEnrichmentPatch` (lines 221-224).

Delete the module-level helpers `mergeBalancedLanes` (lines 250-269), `laneByOrder` (lines 272-292), and `laneNext` (lines 298-310).

In `listByKindRecent`, keep the body but note it is now only ever called with `kind: "paper"` — leave the signature alone so the repo stays free of business rules.

- [ ] **Step 7: Apply the migration and run the db suite**

```bash
bun run db:migrate
cd packages/db && bun test
```

Expected: PASS. `packages/services` does not compile at this point; that is repaired in Task 5.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db)!: restructure feed_items as the literature paper shape

Drops the news-era columns and purges non-paper rows. Not reversible."
```

---

### Task 5: Rebuild the feed write path on the shared shape

`buildFeedItemRow` now takes a `LiteraturePaper` and derives everything else. Both writers — the hydration lane and save-from-search materialization — feed it from the same mapper.

**Files:**
- Modify: `packages/services/src/feed/model.ts`
- Modify: `packages/services/src/feed/write.ts`
- Modify: `packages/services/src/feed/openAlex.ts:20-38,129-179,396-401`
- Modify: `packages/services/src/feed-hydration.service.ts:26-41`
- Modify: `packages/services/src/feed-interaction.service.ts:13-15,33-42`
- Modify: `packages/services/src/index.ts:170-192`
- Modify: `packages/services/test/feed-model.test.ts`
- Modify: `packages/services/test/feed-openalex.test.ts`
- Modify: `packages/services/test/feed-providers.test.ts`
- Modify: `packages/services/test/feed-interaction.test.ts`

**Interfaces:**
- Consumes: `mapOpenAlexWork`, `explorePaperToLiteraturePaper`, `LiteraturePaper` from Task 2; `NewFeedItem` from Task 4.
- Produces:
  - `type FeedPaper = LiteraturePaper & { feedItemId: string }`
  - `buildFeedItemRow(paper: LiteraturePaper, now: number): NewFeedItem`
  - `shapeFeedItem(row: FeedItemRow): FeedPaper`
  - `deriveOrderAt({ publishedAt?, lastSeenAt, createdAt }): number` — unchanged
  - `parsePublishedAt(publicationDate: string | null): number | undefined`
  - `upsertFeedItems(db, papers: LiteraturePaper[], now: number): Promise<FeedItem[]>`

- [ ] **Step 1: Write the failing test**

Replace the contents of `packages/services/test/feed-model.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildFeedItemRow,
  deriveOrderAt,
  parsePublishedAt,
  shapeFeedItem,
} from "../src/feed/model";
import { matchesTopicCategory } from "../src/feed/topicCategories";
import type { LiteraturePaper } from "../src/papers/work";

const PAPER: LiteraturePaper = {
  key: "doi:10.1/qubit",
  title: "Quantum Computing",
  snippet: "A study of qubits",
  doi: "10.1/qubit",
  url: "https://example.org",
  pdfUrl: null,
  hasPdf: false,
  authors: ["A"],
  year: 2023,
  publicationDate: "2023-06-01",
  venue: "Nature",
  citedByCount: 3,
  isOpenAccess: false,
  oaStatus: null,
  workType: "article",
  language: "en",
  isRetracted: false,
  topics: ["physics", "Quantum"],
};

describe("deriveOrderAt", () => {
  test("publishedAt menang atas lastSeenAt/createdAt", () => {
    expect(deriveOrderAt({ publishedAt: 50, lastSeenAt: 99, createdAt: 99 })).toBe(50);
  });

  test("tanpa publishedAt jatuh ke lastSeenAt", () => {
    expect(deriveOrderAt({ lastSeenAt: 70, createdAt: 99 })).toBe(70);
  });
});

describe("parsePublishedAt", () => {
  test("tanggal ISO jadi epoch ms", () => {
    expect(parsePublishedAt("2023-06-01")).toBe(Date.parse("2023-06-01"));
  });

  test("null dan tanggal ngawur jadi undefined", () => {
    expect(parsePublishedAt(null)).toBeUndefined();
    expect(parsePublishedAt("bukan-tanggal")).toBeUndefined();
  });
});

describe("buildFeedItemRow", () => {
  test("menurunkan header mesin dari paper", () => {
    const row = buildFeedItemRow(PAPER, 1_000);
    expect(row.kind).toBe("paper");
    expect(row.key).toBe("doi:10.1/qubit");
    expect(row.dedupeKey).toBe("paper:doi:10.1/qubit");
    expect(row.trendScore).toBe(3);
    expect(row.publishedAt).toBe(Date.parse("2023-06-01"));
    expect(row.orderAt).toBe(Date.parse("2023-06-01"));
    expect(row.createdAt).toBe(1_000);
    expect(row.lastSeenAt).toBe(1_000);
    expect(row.id).toMatch(/[0-9a-f-]{36}/);
  });

  test("paper tanpa sitasi dan tanpa tanggal tetap punya urutan", () => {
    const row = buildFeedItemRow(
      { ...PAPER, citedByCount: null, publicationDate: null },
      2_000,
    );
    expect(row.trendScore).toBe(0);
    expect(row.publishedAt).toBeUndefined();
    expect(row.orderAt).toBe(2_000);
  });
});

describe("shapeFeedItem", () => {
  test("baris jadi paper + feedItemId, tanpa field mesin", () => {
    // `FeedItemRow` = id + persis 18 field LiteraturePaper, jadi spread ini typecheck apa adanya.
    expect(shapeFeedItem({ id: "feed_1", ...PAPER })).toEqual({ ...PAPER, feedItemId: "feed_1" });
  });
});

describe("matchesTopicCategory", () => {
  test("mencocokkan topik ke kategori", () => {
    expect(matchesTopicCategory("sains_teknologi", ["physics"], "Quantum")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/services && bun test test/feed-model.test.ts
```

Expected: FAIL — `parsePublishedAt` is not exported and `buildFeedItemRow` does not accept a `LiteraturePaper`.

- [ ] **Step 3: Rewrite the feed model**

Replace the whole of `packages/services/src/feed/model.ts` with:

```ts
/**
 * Model domain feed — leaf murni (tanpa DB/Elysia/BullMQ) supaya funnel write
 * (`buildFeedItemRow`) berperilaku identik di lane worker maupun di materialisasi save.
 *
 * INVARIAN: `deriveOrderAt` HARUS jalan di SETIAP write feed (`buildFeedItemRow` adalah
 * satu-satunya konstruktor row) supaya keyset infinite-scroll punya urutan total.
 */
import type { NewFeedItem } from "@aqsha/db";
import type { LiteraturePaper } from "../papers/work";

/** Paper feed di kabel: bentuk hasil pencarian, plus pegangan untuk hide/save. */
export type FeedPaper = LiteraturePaper & { feedItemId: string };

/**
 * Kunci sort kronologis NON-optional untuk by_order: `publishedAt ?? lastSeenAt ?? createdAt`.
 * Dengan `lastSeenAt`/`createdAt` default `now`, paper tanpa tanggal terbit tetap punya urutan.
 */
export function deriveOrderAt(item: {
  publishedAt?: number;
  lastSeenAt: number;
  createdAt: number;
}): number {
  return item.publishedAt ?? item.lastSeenAt ?? item.createdAt;
}

/** Tanggal terbit OpenAlex (ISO) → epoch ms untuk kolom sort. Tanggal tak terbaca → undefined. */
export function parsePublishedAt(publicationDate: string | null): number | undefined {
  if (!publicationDate) return undefined;
  const ms = Date.parse(publicationDate);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Satu-satunya konstruktor row feed_items. Mint `id`, set `createdAt`/`lastSeenAt`, dan turunkan
 * `dedupeKey`/`publishedAt`/`orderAt`/`trendScore`. Semua jalur write WAJIB lewat sini.
 */
export function buildFeedItemRow(paper: LiteraturePaper, now: number): NewFeedItem {
  const publishedAt = parsePublishedAt(paper.publicationDate);
  const orderAt = deriveOrderAt({ publishedAt, lastSeenAt: now, createdAt: now });
  return {
    id: crypto.randomUUID(),
    kind: "paper",
    key: paper.key,
    title: paper.title,
    snippet: paper.snippet,
    doi: paper.doi,
    url: paper.url,
    pdfUrl: paper.pdfUrl,
    hasPdf: paper.hasPdf,
    authors: paper.authors,
    year: paper.year,
    publicationDate: paper.publicationDate,
    venue: paper.venue,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    oaStatus: paper.oaStatus,
    workType: paper.workType,
    language: paper.language,
    isRetracted: paper.isRetracted,
    topics: paper.topics,
    trendScore: paper.citedByCount ?? 0,
    publishedAt,
    dedupeKey: `paper:${paper.key}`,
    lastSeenAt: now,
    createdAt: now,
    orderAt,
  };
}

/** Baris feed_items sebagaimana dibaca Drizzle (subset yang dipakai shaping). */
export type FeedItemRow = {
  id: string;
  key: string;
  title: string;
  snippet: string | null;
  doi: string | null;
  url: string | null;
  pdfUrl: string | null;
  hasPdf: boolean;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean;
  oaStatus: string | null;
  workType: string | null;
  language: string | null;
  isRetracted: boolean;
  topics: string[];
};

/** Proyeksi row → paper di kabel: buang header mesin, sisakan bentuk hasil pencarian. */
export function shapeFeedItem(row: FeedItemRow): FeedPaper {
  return {
    feedItemId: row.id,
    key: row.key,
    title: row.title,
    snippet: row.snippet,
    doi: row.doi,
    url: row.url,
    pdfUrl: row.pdfUrl,
    hasPdf: row.hasPdf,
    authors: row.authors,
    year: row.year,
    publicationDate: row.publicationDate,
    venue: row.venue,
    citedByCount: row.citedByCount,
    isOpenAccess: row.isOpenAccess,
    oaStatus: row.oaStatus,
    workType: row.workType,
    language: row.language,
    isRetracted: row.isRetracted,
    topics: row.topics,
  };
}
```

- [ ] **Step 4: Follow through in the write funnel**

Replace `packages/services/src/feed/write.ts` with:

```ts
/**
 * Funnel write feed_items — SATU-SATUNYA jalur tulis. Map paper → buildFeedItemRow
 * (derive orderAt) → FeedRepo.upsertByDedupeKey. Semua lane hydration + materialisasi paper
 * WAJIB lewat sini supaya invariant derive selalu jalan.
 */
import { type DbOrTx, type FeedItem, FeedRepo } from "@aqsha/db";
import type { LiteraturePaper } from "../papers/work";
import { buildFeedItemRow } from "./model";

export async function upsertFeedItems(
  db: DbOrTx,
  papers: LiteraturePaper[],
  now: number,
): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  for (const paper of papers) {
    out.push(await FeedRepo.upsertByDedupeKey(db, buildFeedItemRow(paper, now)));
  }
  return out;
}
```

- [ ] **Step 5: Point the feed provider at the shared mapper**

In `packages/services/src/feed/openAlex.ts`:

Replace `OPENALEX_SELECT_FIELDS` (lines 21-38) with a re-use of the shared list. Change the import block to include:

```ts
import { LITERATURE_WORK_SELECT, mapOpenAlexWork, type LiteraturePaper, type OpenAlexWorkPayload } from "../papers/work";
```

and replace every `OPENALEX_SELECT_FIELDS.join(",")` with `LITERATURE_WORK_SELECT` (line 108 in `buildOpenAlexWorksUrl`).

Delete `openAlexWorkToExplorePaper` (lines 129-179) and `trimSnippet` (lines 124-127).

Change `OpenAlexWork` to an alias so the semantic/group-by helpers keep working:

```ts
/** Work OpenAlex sebagaimana dikonsumsi feed; `related_works` khusus graf kemiripan. */
export type OpenAlexWork = OpenAlexWorkPayload & { related_works?: string[] | null };
```

Replace `worksToPapers` (lines 396-401) with:

```ts
function worksToPapers(works: OpenAlexWork[], limit: number): LiteraturePaper[] {
  const byKey = new Map<string, LiteraturePaper>();
  for (const work of works) {
    const paper = mapOpenAlexWork(work);
    if (paper && !byKey.has(paper.key)) byKey.set(paper.key, paper);
    if (byKey.size >= limit) break;
  }
  return [...byKey.values()];
}
```

Change the return type of `fetchOpenAlexWorks` (line 207) from `{ papers: ExplorePaperInput[]; works: OpenAlexWork[] }` to `{ papers: LiteraturePaper[]; works: OpenAlexWork[] }`, and delete the now-unused imports of `canonicalPaperKey`, `dedupeExplorePapers`, `ExplorePaperInput`, `reconstructOpenAlexAbstract`, `firstNonEmpty`, and `uniqueCompact`. `normalizeDoi` stays — `normalizeDoiLoose` uses it. `collapse` and `numberOrUndefined` are no longer used; remove them from the `../lib/text` import.

- [ ] **Step 6: Simplify the hydration lane**

In `packages/services/src/feed-hydration.service.ts`, replace the import of `paperToFeedInput` on line 8 with nothing (delete the line), and replace `refreshTrendingPapers` (lines 27-41) with:

```ts
  /** Trending papers OpenAlex → cache explore_papers + materialize feed. */
  async refreshTrendingPapers(db: Db, args?: { limit?: number }): Promise<RefreshResult> {
    const limit = Math.min(args?.limit ?? TRENDING_LIMIT, 50);
    const { papers } = await fetchOpenAlexWorks({ query: "", limit, includeRetracted: true });
    if (papers.length === 0) return { fetched: 0, written: 0 };
    const now = Date.now();
    await PaperCacheService.upsert(db, papers.map(literaturePaperToExplorePaper), now);
    await upsertFeedItems(db, papers, now);
    return { fetched: papers.length, written: papers.length };
  },
```

Change the imports on lines 7-11 to:

```ts
import { fetchOpenAlexWorks } from "./feed/openAlex";
import { literaturePaperToExplorePaper } from "./papers/work";
import { upsertFeedItems } from "./feed/write";
import { PaperCacheService } from "./paper-cache.service";
import { enqueue, FEED_QUEUES } from "./clients/queue";
```

`workIdentifiers` is no longer needed here — retraction now rides on the mapped paper itself.

- [ ] **Step 7: Fix save-from-search materialization**

In `packages/services/src/feed-interaction.service.ts`, replace the `paperToFeedInput` import (line 13) with:

```ts
import { explorePaperToLiteraturePaper } from "./papers/work";
```

Replace `ensureFeedItemForPaperKey` (lines 33-42) with:

```ts
/** Resolve baris feed untuk paperKey; materialisasi dari cache explore_papers bila perlu. */
async function ensureFeedItemForPaperKey(db: DbOrTx, paperKey: string): Promise<string | null> {
  const existing = await FeedRepo.findByDedupeKey(db, `paper:${paperKey}`);
  if (existing) return existing.id;

  const paper = await PaperCacheService.getByKey(db as never, paperKey);
  if (!paper) return null;

  const [row] = await upsertFeedItems(
    db,
    [
      explorePaperToLiteraturePaper({
        key: paper.key,
        title: paper.title,
        snippet: paper.snippet ?? null,
        url: paper.url,
        pdfUrl: paper.pdfUrl ?? null,
        doi: paper.doi ?? null,
        authors: paper.authors,
        year: paper.year ?? null,
        publicationDate: paper.publicationDate ?? null,
        venue: paper.venue ?? null,
        citedByCount: paper.citedByCount ?? null,
        isOpenAccess: paper.isOpenAccess ?? null,
        oaStatus: paper.oaStatus ?? null,
        workType: paper.workType ?? null,
        language: paper.language ?? null,
        isRetracted: paper.isRetracted ?? false,
        topics: paper.topics,
      }),
    ],
    Date.now(),
  );
  return row?.id ?? null;
}
```

Then update `packages/services/test/feed-interaction.test.ts`, which stubs feed rows with the old column name. Change its `feedRow` helper (line 8) to:

```ts
const feedRow = (over: Record<string, unknown> = {}) =>
  ({ id: "F1", topics: ["ml"], key: "doi:10.1/a", ...over }) as never;
```

Every `spyOn(PaperCacheService, "getByKey")` in that file must resolve a paper carrying the four new fields, otherwise `explorePaperToLiteraturePaper` reads `undefined`. Add `oaStatus: null, workType: null, language: null, isRetracted: false` to each mocked paper object, alongside a `snippet` and `topics`.

- [ ] **Step 8: Update the package export surface**

In `packages/services/src/index.ts`, replace the `./feed/model` export block (lines 170-184) with:

```ts
export {
  buildFeedItemRow,
  deriveOrderAt,
  type FeedItemRow,
  type FeedPaper,
  parsePublishedAt,
  shapeFeedItem,
} from "./feed/model";
```

`FeedClaim`, `FeedItemInput`, `FeedItemResponse`, `FeedKind`, `FeedProvider`, `FeedRetractionStatus`, `paperToFeedInput`, and `deriveSearchText` no longer exist and must be removed from this file.

- [ ] **Step 9: Update the provider tests**

In `packages/services/test/feed-openalex.test.ts`, delete the `openAlexWorkToExplorePaper` and `paperToFeedInput` imports and every test that calls them, keeping the `buildOpenAlexWorksUrl`, `workIdentifiers`, `canonicalPaperKey`, `dedupeExplorePapers`, and `deriveKeyProbe` tests. Add:

```ts
import { mapOpenAlexWork } from "../src/papers/work";
import { buildFeedItemRow } from "../src/feed/model";

describe("lane feed memakai mapper bersama", () => {
  test("work trending jadi row feed lewat mapOpenAlexWork", () => {
    const paper = mapOpenAlexWork(WORK)!;
    const row = buildFeedItemRow(paper, 1_000);
    expect(row.key).toBe(paper.key);
    expect(row.oaStatus).toBe(paper.oaStatus);
    expect(row.workType).toBe(paper.workType);
    expect(row.language).toBe(paper.language);
  });
});
```

In `packages/services/test/feed-providers.test.ts`, remove any assertions against `openAlexWorkToExplorePaper`; if the file contains nothing else, delete it and drop it from git.

- [ ] **Step 10: Write the parity contract test**

Append to `packages/services/test/papers-work.test.ts`:

```ts
import { buildFeedItemRow, shapeFeedItem } from "../src/feed/model";

describe("paritas feed ↔ pencarian", () => {
  test("setiap field paper mendarat di baris feed tanpa berubah", () => {
    const fromSearch = mapOpenAlexWork(WORK)!;
    const row = buildFeedItemRow(fromSearch, 1_000) as Record<string, unknown>;
    for (const field of Object.keys(fromSearch)) {
      expect(row[field]).toEqual((fromSearch as Record<string, unknown>)[field]);
    }
  });

  test("baris feed kembali jadi paper yang sama dengan hasil pencarian", () => {
    const fromSearch = mapOpenAlexWork(WORK)!;
    const { feedItemId, ...fromFeed } = shapeFeedItem({ id: "feed_1", ...fromSearch });
    expect(feedItemId).toBe("feed_1");
    expect(fromFeed).toEqual(fromSearch);
  });
});
```

- [ ] **Step 11: Run the services suite**

```bash
cd packages/services && bun test
```

Expected: PASS for `papers-work`, `feed-model`, `feed-openalex`, `feed-interaction`, and `literature-search-*`. `feed-service.test.ts` still fails — Task 6 repairs the read path.

- [ ] **Step 12: Commit**

```bash
git add packages/services
git commit -m "feat(services): build feed rows from the shared literature paper shape"
```

---

### Task 6: Simplify the feed read path

With one kind in the table, balanced two-lane pagination and the kind-nudging ranking helpers describe a world that no longer exists. Collapse them and strip the response down to the paper shape.

**Files:**
- Modify: `packages/services/src/feed.service.ts`
- Modify: `packages/services/src/feed/ranking.ts:45-98`
- Modify: `packages/services/src/context.service.ts:67,77,105,129-134,168-180,263-330`
- Modify: `packages/db/src/cursor.ts:37-76`
- Modify: `packages/services/test/feed-ranking.test.ts`
- Modify: `packages/services/test/feed-service.test.ts`

**Interfaces:**
- Consumes: `shapeFeedItem`, `FeedPaper` from Task 5; `FeedRepo.paginateByOrder` from Task 4.
- Produces:
  - `FeedService.getFeedPaginated(db, ownerUserId, { limit?, cursor?, mode?, topic? }): Promise<{ items: FeedPaper[]; nextCursor: string | null }>`
  - `FeedService.getFeed(db, ownerUserId, { limit?, serendipity? }): Promise<FeedPaper[]>`
  - `FeedService.getFeedItem(db, ownerUserId, id): Promise<FeedPaper | null>`
  - `FeedService.getRelatedFeedItems(db, ownerUserId, id, limit?): Promise<FeedPaper[]>`
  - The `kinds` argument no longer exists on any of them.

- [ ] **Step 1: Write the failing test**

In `packages/services/test/feed-ranking.test.ts`, delete the `kindBoost`, `deClump`, and `reasonFor` describe blocks and their imports, keeping `interestMatch`, `recencyScore`, and `popularityScore`.

In `packages/services/test/feed-service.test.ts`, replace every `kinds: [...]` argument with nothing and assert the new shape. Append:

```ts
describe("bentuk respons feed", () => {
  test("item feed adalah paper + feedItemId, tanpa field mesin", () => {
    const shaped = shapeFeedItem({
      id: "feed_1",
      key: "doi:10.1/a",
      title: "T",
      snippet: null,
      doi: "10.1/a",
      url: null,
      pdfUrl: null,
      hasPdf: false,
      authors: [],
      year: null,
      publicationDate: null,
      venue: null,
      citedByCount: null,
      isOpenAccess: false,
      oaStatus: null,
      workType: null,
      language: null,
      isRetracted: false,
      topics: [],
    });
    expect(Object.keys(shaped).sort()).toEqual(
      [
        "authors", "citedByCount", "doi", "feedItemId", "hasPdf", "isOpenAccess",
        "isRetracted", "key", "language", "oaStatus", "pdfUrl", "publicationDate",
        "snippet", "title", "topics", "url", "venue", "workType", "year",
      ].sort(),
    );
  });
});
```

Add `import { shapeFeedItem } from "../src/feed/model";` to that file.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/services && bun test test/feed-service.test.ts
```

Expected: FAIL — `shapeFeedItem` still requires the old `FeedItemRow` and `FeedService` still passes `kinds`.

- [ ] **Step 3: Trim the ranking helpers**

In `packages/services/src/feed/ranking.ts`, delete `kindBoost` (lines 45-58), `deClump` (lines 60-76), and `reasonFor` (lines 78-98). Update the module docblock to:

```ts
/**
 * Ranking helpers feed — skor minat/kesegaran/popularitas. Pure (tanpa DB). Dipakai
 * FeedService.getFeed/getFeedPaginated.
 */
```

- [ ] **Step 4: Rewrite the service**

Replace the whole of `packages/services/src/feed.service.ts` with:

```ts
/**
 * FeedService — read path discovery. Framework-agnostic: re-rank For You/Top/Topics in-memory,
 * filter hidden/topic post-fetch (page boleh menyusut, nextCursor tetap benar). Ownership
 * di-enforce caller (read feed = milik semua user; owner-scoped hanya hidden/saved/interest).
 */
import {
  type Db,
  decodeKeysetCursor,
  FeedInteractionRepo,
  type FeedItem,
  FeedRepo,
} from "@aqsha/db";
import { InterestService } from "./interest.service";
import { interestMatch, popularityScore, recencyScore } from "./feed/ranking";
import { type FeedPaper, shapeFeedItem } from "./feed/model";
import {
  type DiscoveryTopicCategory,
  isDiscoveryTopicCategory,
  matchesTopicCategory,
} from "./feed/topicCategories";

const FEED_PAGE_LIMIT = 40;
const HIDDEN_CAP = 1_000;

export type FeedMode = "foryou" | "top" | "topics";

export const FeedService = {
  /**
   * Bento home feed (non-paginated): pool best-trend ∪ recent → re-rank interest + recency +
   * popularity → shape.
   */
  async getFeed(
    db: Db,
    ownerUserId: string,
    args: { limit?: number; serendipity?: boolean },
  ): Promise<FeedPaper[]> {
    const limit = Math.min(args.limit ?? FEED_PAGE_LIMIT, 80);
    const pool = Math.min(limit * 3, 120);
    const now = Date.now();

    const [byTrend, byRecent] = await Promise.all([
      FeedRepo.listByKindTrend(db, "paper", pool),
      FeedRepo.listByKindPublished(db, "paper", pool),
    ]);
    const byId = new Map<string, FeedItem>();
    for (const item of [...byTrend, ...byRecent]) byId.set(item.id, item);

    const interests = await InterestService.loadWeights(db, ownerUserId);
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));

    const scored = [...byId.values()]
      .filter((item) => !hidden.has(item.id))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score = args.serendipity
          ? recency * 0.8 + popularity * 0.6 + (1 - Math.min(1, interest.normalized)) * 0.9
          : recency * 1.0 + popularity * 0.5 + interest.normalized * 1.5;
        return { item, score };
      });
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ item }) => shapeFeedItem(item));
  },

  /**
   * Paginated feed (infinite scroll) — keyset `(order_at, id)` DESC lalu re-rank per-page.
   * mode top = popularity-lean (no interest); foryou/topics = interest-aware; topics filter
   * kategori. `nextCursor` datang dari baris RAW terakhir, jadi tetap benar walau page menyusut.
   */
  async getFeedPaginated(
    db: Db,
    ownerUserId: string,
    args: { limit?: number; cursor?: string; mode?: FeedMode; topic?: string },
  ): Promise<{ items: FeedPaper[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(args.limit ?? FEED_PAGE_LIMIT, 1), 40);
    const mode = args.mode ?? "foryou";
    const now = Date.now();
    const category: DiscoveryTopicCategory | null =
      mode === "topics" && args.topic && isDiscoveryTopicCategory(args.topic) ? args.topic : null;

    const page = await FeedRepo.paginateByOrder(db, {
      limit,
      cursor: decodeKeysetCursor(args.cursor),
    });

    const interests = await InterestService.loadWeights(db, ownerUserId);
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));

    const scored = page.items
      .filter((item) => !hidden.has(item.id))
      .filter((item) => !category || matchesTopicCategory(category, item.topics, item.title))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score =
          mode === "top"
            ? popularity * 1.0 + recency * 0.6
            : recency * 1.0 + popularity * 0.5 + interest.normalized * 1.5;
        return { item, score };
      });
    scored.sort((a, b) => b.score - a.score);

    return { items: scored.map(({ item }) => shapeFeedItem(item)), nextCursor: page.nextCursor };
  },

  async getFeedItem(db: Db, _ownerUserId: string, id: string): Promise<FeedPaper | null> {
    const item = await FeedRepo.findById(db, id);
    return item ? shapeFeedItem(item) : null;
  },

  /** Related ("Discover more"): pool recent → rank topic-overlap lalu recency. Exclude self + hidden. */
  async getRelatedFeedItems(
    db: Db,
    ownerUserId: string,
    id: string,
    limit?: number,
  ): Promise<FeedPaper[]> {
    const self = await FeedRepo.findById(db, id);
    if (!self) return [];
    const n = Math.min(Math.max(limit ?? 6, 1), 8);
    const pool = await FeedRepo.listByKindRecent(db, {
      kind: "paper",
      excludeId: id,
      limit: n * 4,
    });
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));
    const selfTopics = new Set(self.topics.map((t) => t.trim().toLowerCase()));
    return pool
      .filter((row) => !hidden.has(row.id))
      .map((row) => ({
        row,
        overlap: row.topics.reduce(
          (count, t) => count + (selfTopics.has(t.trim().toLowerCase()) ? 1 : 0),
          0,
        ),
        recency: row.publishedAt ?? row.lastSeenAt,
      }))
      .sort((a, b) => b.overlap - a.overlap || b.recency - a.recency)
      .slice(0, n)
      .map((entry) => shapeFeedItem(entry.row));
  },
};
```

- [ ] **Step 5: Remove the dead feed-item branch from context**

In `packages/services/src/context.service.ts`:

- Delete line 67 (`const wantFeedItems = ...`).
- In the `Promise.all` on line 77, remove `feedItems` from the destructuring and delete its `Promise.all(wantFeedItems.map(...))` entry (lines 104-108) together with the comment above it.
- Delete the `validFeedItems` block (lines 129-134) including its comment.
- In the `buildNote(...)` call, remove the `validFeedItems` argument.
- Change `feedItemIds: validFeedItems.map((f) => f._id),` to `feedItemIds: [],` and add above it:

```ts
      // Kontrak konteks masih menerima `feedItemIds`, tapi tak ada jenis feed item yang
      // dilampirkan ke catatan agen — selalu kosong.
```

- In `buildNote` (line 263), delete the `feedItems: NoteFeedItem[]` parameter, its clause in the early-return emptiness check (line 275), and the `if (feedItems.length > 0) { ... }` block (lines 320-325 and its loop body). Delete the `NoteFeedItem` type.
- Remove the now-unused `FeedService` import if nothing else in the file uses it.

- [ ] **Step 6: Retire the balanced-lane cursor**

`decodeBalancedCursor` was the last consumer of the two-lane cursor format, and it just lost its only caller. In `packages/db/src/cursor.ts`, delete lines 37-76: the `LaneCursor` and `BalancedCursor` types, `normalizeLane`, `encodeBalancedCursor`, and `decodeBalancedCursor`. Keep `KeysetCursor`, `encodeKeysetCursor`, and `decodeKeysetCursor` untouched.

Update the module docblock's last paragraph to drop the stale roadmap note:

```ts
 * Reusable: dipakai repo paginated mana pun (workspaces, threads, artifacts, citations, feed).
```

- [ ] **Step 7: Run the suites**

```bash
cd packages/db && bun test
cd packages/services && bun test
bun run typecheck
```

Expected: both suites PASS. `typecheck` shows no new `@aqsha/services` or `@aqsha/db` errors; `@aqsha/api` still fails on the `kinds` argument, repaired in Task 7.

- [ ] **Step 8: Commit**

```bash
git add packages/services
git commit -m "refactor(services): collapse the cross-kind feed machinery to paper-only"
```

---

### Task 7: Serve the unified shape from the API

**Files:**
- Modify: `apps/api/src/routes/feed.ts:32-95,177-205`
- Modify: `apps/api/test/feed.test.ts`

**Interfaces:**
- Consumes: `FeedService` from Task 6, `buildFeedItemRow` from Task 5.
- Produces: `GET /feed` → `{ items: FeedPaper[]; nextCursor: string | null }`; `GET /feed/home` → `{ items: FeedPaper[] }`. Neither accepts `kinds`.

- [ ] **Step 1: Write the failing test**

In `apps/api/test/feed.test.ts`, change the `input()` helper to build a `LiteraturePaper` instead of a `FeedItemInput`, and change the import on line 1 to:

```ts
import { buildFeedItemRow, type LiteraturePaper } from "@aqsha/services";
```

Replace the helper with:

```ts
function input(key: string, over: Partial<LiteraturePaper>): LiteraturePaper {
  return {
    key,
    title: "Paper uji",
    snippet: null,
    doi: null,
    url: "https://example.org/x",
    pdfUrl: null,
    hasPdf: false,
    authors: [],
    year: null,
    publicationDate: null,
    venue: null,
    citedByCount: null,
    isOpenAccess: false,
    oaStatus: null,
    workType: null,
    language: null,
    isRetracted: false,
    topics: [],
    ...over,
  };
}
```

Remove every `kinds=paper` query string from the request paths in that file, and append:

```ts
describe("GET /feed bentuk item", () => {
  itest("item membawa feedItemId dan field paper, tanpa field mesin", async () => {
    const db = createDb(DATABASE_URL!);
    await FeedRepo.upsertByDedupeKey(
      db,
      buildFeedItemRow(input(`doi:10.7/api-${suffix}`, { title: "Judul API" }), Date.now()),
    );
    const res = await app.handle(req("GET", "/feed?limit=5", `tok_feedtest_${suffix}`));
    const body = await readJson(res);
    const item = body.items.find((i: any) => i.key === `doi:10.7/api-${suffix}`);
    expect(item).toBeDefined();
    expect(typeof item.feedItemId).toBe("string");
    expect(item.title).toBe("Judul API");
    expect(item).not.toHaveProperty("summary");
    expect(item).not.toHaveProperty("provider");
    expect(item).not.toHaveProperty("trendScore");
    expect(item).not.toHaveProperty("kind");
  });
});
```

- [ ] **Step 2: Rebuild the dist packages, then run the test to verify it fails**

`apps/api` imports `@aqsha/db` and `@aqsha/services` from their built `dist/`, not from source, so the new types are invisible until they are rebuilt:

```bash
bun run build:dist
cd apps/api && bun test test/feed.test.ts -t "bentuk item"
```

Expected: FAIL — the route still passes `kinds` to `FeedService`, so `@aqsha/api` does not compile.

- [ ] **Step 3: Drop the `kinds` parameter**

In `apps/api/src/routes/feed.ts`:

- Delete the `FEED_KIND` union (lines 32-38).
- In `GET /feed`, remove `kinds: query.kinds,` from the service call and `kinds: t.Optional(t.Array(FEED_KIND)),` from the query schema.
- In `GET /feed/home`, remove `kinds: query.kinds,` and `kinds: t.Optional(t.Array(FEED_KIND)),`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && bun test test/feed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify the whole backend**

```bash
bun run test
bun run typecheck
```

Expected: `packages/db`, `packages/chat-core`, `packages/services`, and `apps/api` all PASS. `@aqsha/web` typecheck fails — known baseline plus the intended breakage.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api)!: return the literature paper shape from the feed routes"
```

---

### Task 8: Delete the frontend adapters

**Files:**
- Modify: `apps/svelte/src/lib/features/explore/literature-search-types.ts`
- Modify: `apps/svelte/src/lib/features/discovery/types.ts:1-31,97-118`
- Modify: `apps/svelte/src/lib/features/discovery/query-options.ts:6-20,22-52`
- Modify: `apps/svelte/src/lib/features/discovery/format.ts:1-3,43-end`
- Modify: `apps/svelte/src/lib/features/explore/components/ExploreSourceRow.svelte`
- Modify: `apps/svelte/src/lib/features/explore/components/ExploreFindings.svelte`
- Modify: `apps/svelte/src/lib/features/explore/components/LiteratureResults.svelte`
- Delete: `apps/svelte/src/lib/features/explore/explore-source.ts`
- Delete: `apps/svelte/src/lib/features/discovery/model.ts`
- Delete: `apps/svelte/src/lib/features/discovery/model.spec.ts`
- Delete: `apps/svelte/src/lib/features/discovery/components/PaperCover.svelte`

**Interfaces:**
- Consumes: `GET /feed` returning `FeedPaper` from Task 7.
- Produces: `FeedPaper = LiteraturePaper & { feedItemId: string }` and `literaturePaperToSearchInput(paper: LiteraturePaper): SearchSourceInput`, both in `literature-search-types.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/svelte/src/lib/features/explore/literature-search-types.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { literaturePaperToSearchInput, type LiteraturePaper } from './literature-search-types';

const PAPER: LiteraturePaper = {
	key: 'doi:10.1/a',
	title: 'Judul',
	snippet: 'Cuplikan',
	doi: '10.1/a',
	url: 'https://e.org/a',
	pdfUrl: null,
	hasPdf: false,
	authors: ['A', 'B'],
	year: 2024,
	publicationDate: '2024-01-01',
	venue: 'Jurnal',
	citedByCount: 3,
	isOpenAccess: true,
	oaStatus: 'gold',
	workType: 'article',
	language: 'id',
	isRetracted: false,
	topics: ['t']
};

describe('literaturePaperToSearchInput', () => {
	it('memetakan paper ke input simpan tanpa adapter perantara', () => {
		expect(literaturePaperToSearchInput(PAPER)).toEqual({
			clientKey: 'doi:10.1/a',
			title: 'Judul',
			doi: '10.1/a',
			url: 'https://e.org/a',
			authors: ['A', 'B'],
			year: 2024,
			venue: 'Jurnal'
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/svelte && bun run test -- literature-search-types
```

Expected: FAIL — `literaturePaperToSearchInput` is not exported.

- [ ] **Step 3: Move the save-input mapper**

At the end of `apps/svelte/src/lib/features/explore/literature-search-types.ts`, add:

```ts
/** Feed rows are the same paper as a search result, plus the handle used to hide or save them. */
export type FeedPaper = LiteraturePaper & { feedItemId: string };

export function literaturePaperToSearchInput(paper: LiteraturePaper): SearchSourceInput {
	return {
		clientKey: paper.key,
		title: paper.title,
		doi: paper.doi,
		url: paper.url,
		authors: paper.authors,
		year: paper.year,
		venue: paper.venue
	};
}
```

Add at the top of that file:

```ts
import type { SearchSourceInput } from '$lib/features/citations/types';
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/svelte && bun run test -- literature-search-types
```

Expected: PASS.

- [ ] **Step 5: Delete the adapters and dead discovery code**

```bash
cd /Users/vitoandareasmanik/Development/project/aqsha-explore
git rm apps/svelte/src/lib/features/explore/explore-source.ts \
       apps/svelte/src/lib/features/discovery/model.ts \
       apps/svelte/src/lib/features/discovery/model.spec.ts \
       apps/svelte/src/lib/features/discovery/components/PaperCover.svelte
```

In `apps/svelte/src/lib/features/discovery/types.ts`, delete `FeedKind` (line 5), the `FeedItem` type (lines 7-31), `feedItemHref` (lines 97-102), and `KIND_LABELS` (lines 116-118). Keep `DiscoveryItemRef`, `ExplorePaper`, every `PaperEnrichment*` type, `FeedMode`, `FeedTopic`, and `FEED_TOPIC_LABELS`.

In `apps/svelte/src/lib/features/discovery/format.ts`, delete `buildSourceLine` and the `DiscoveryItem` import on line 3. Keep `formatCitationCount`.

- [ ] **Step 6: Point the feed query at the new shape**

In `apps/svelte/src/lib/features/discovery/query-options.ts`:

Change line 6 to `import type { ExplorePaper, FeedMode, FeedTopic } from './types';` and add:

```ts
import type { FeedPaper } from '$lib/features/explore/literature-search-types';
```

Replace line 12 with `export type FeedPage = { items: FeedPaper[]; nextCursor: string | null };` and delete `const VISIBLE_KINDS` (line 9).

In `feedInfiniteQueryOptions`, remove `kinds: [...VISIBLE_KINDS],` from the request query.

- [ ] **Step 7: Render `LiteraturePaper` directly**

In `apps/svelte/src/lib/features/explore/components/ExploreSourceRow.svelte`:

Change the import on line 14 to:

```ts
	import type { LiteraturePaper } from '../literature-search-types';
```

Change the props block (lines 18-30) to:

```ts
	let {
		source,
		selected = false,
		onSelectedChange,
		onSaved,
		onHide
	}: {
		source: LiteraturePaper;
		selected?: boolean;
		onSelectedChange: (selected: boolean) => void;
		onSaved?: () => void;
		onHide?: () => void;
	} = $props();

	// Every row is a keyed paper now, so the reader link is always internal.
	const detailHref = $derived(`/app/explore/${encodeURIComponent(source.key)}`);
```

Replace the title anchor (lines 85-91) with:

```svelte
					<a
						href={detailHref}
						class="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>{source.title}</a
					>
```

Replace `source.summary` on lines 94-97 with `source.snippet`:

```svelte
				{#if source.snippet}
					<p class="mt-2 line-clamp-3 max-w-[75ch] text-[13px] leading-5 text-ink-soft">
						{source.snippet}
					</p>
				{/if}
```

- [ ] **Step 8: Drop the mapping from both lists**

In `apps/svelte/src/lib/features/explore/components/ExploreFindings.svelte`:

Replace the imports on lines 12-22 with:

```ts
	import { useFeedInfinite, useHideDiscovery, useRecordInteraction } from '$lib/features/discovery/api';
	import type { SearchSourceInput } from '$lib/features/citations/types';
	import type { FeedMode, FeedTopic } from '$lib/features/discovery/types';
	import {
		literaturePaperToSearchInput,
		type FeedPaper
	} from '../literature-search-types';
	import ExploreFeedSkeleton from './ExploreFeedSkeleton.svelte';
	import LiteratureBatchBar from './LiteratureBatchBar.svelte';
	import ExploreSourceRow from './ExploreSourceRow.svelte';
```

Replace the `items` and `selectedSources` derivations (lines 42-71) with:

```ts
	const items = $derived.by<FeedPaper[]>(() => {
		const out: FeedPaper[] = [];
		const seen = new SvelteSet<string>();
		for (const page of feedQuery.data?.pages ?? []) {
			for (const item of page.items) {
				if (seen.has(item.key)) continue;
				seen.add(item.key);
				if (!hidden.has(item.key)) out.push(item);
			}
		}
		return out;
	});
	const rawCount = $derived(
		(feedQuery.data?.pages ?? []).reduce((count, page) => count + page.items.length, 0)
	);
	const feedStatus = $derived<'LoadingMore' | 'CanLoadMore' | 'Exhausted'>(
		feedQuery.isFetchingNextPage
			? 'LoadingMore'
			: feedQuery.hasNextPage
				? 'CanLoadMore'
				: 'Exhausted'
	);
	const selectedKeys = new SvelteSet<string>();
	const selectedSources = $derived<SearchSourceInput[]>(
		items.filter((item) => selectedKeys.has(item.key)).map(literaturePaperToSearchInput)
	);
```

Replace the three handlers (lines 113-132) with:

```ts
	function handleSelectedChange(item: FeedPaper, selected: boolean): void {
		if (selected) selectedKeys.add(item.key);
		else selectedKeys.delete(item.key);
	}

	function clearSelection(): void {
		selectedKeys.clear();
	}

	function handleSaved(item: FeedPaper): void {
		record.mutate({ itemRef: { kind: 'feed', feedItemId: item.feedItemId }, kind: 'save' });
	}

	function handleHide(item: FeedPaper): void {
		hidden.add(item.key);
		selectedKeys.delete(item.key);
		hide.mutate(
			{ kind: 'feed', feedItemId: item.feedItemId },
			{ onError: () => toast.error('Gagal menyembunyikan.') }
		);
	}
```

Replace the list loop (lines 154-162) with:

```svelte
				{#each items as item (item.key)}
					<ExploreSourceRow
						source={item}
						selected={selectedKeys.has(item.key)}
						onSelectedChange={(selected) => handleSelectedChange(item, selected)}
						onSaved={() => handleSaved(item)}
						onHide={() => handleHide(item)}
					/>
				{/each}
```

In `apps/svelte/src/lib/features/explore/components/LiteratureResults.svelte`:

Change line 16 to:

```ts
	import { literaturePaperToSearchInput } from '../literature-search-types';
```

Replace `selectedSources` (lines 69-73) with:

```ts
	const selectedSources = $derived<SearchSourceInput[]>(
		items.filter((item) => selectedKeys.has(item.key)).map(literaturePaperToSearchInput)
	);
```

Replace line 149 with `source={paper}`.

- [ ] **Step 9: Run the frontend gates**

```bash
cd apps/svelte && bun run check && bun run test
```

Expected: `svelte-check` reports 0 errors; the vitest suites pass.

- [ ] **Step 10: Commit**

```bash
git add apps/svelte
git commit -m "refactor(svelte): render feed and search rows from one paper type"
```

---

### Task 9: Repopulate the feed and verify end to end

The migration leaves surviving rows with null `publication_date`, `oa_status`, `work_type`, and `language`. Run the hydration lane so the feed carries the full shape, then confirm the page renders.

**Files:** none modified.

- [ ] **Step 1: Run the hydration lane**

Start the API and the worker:

```bash
bun run dev:api
bun run dev:worker
```

In a third shell, fan out the lane through the admin route (`apps/api/src/routes/admin.ts:31`). It is admin-gated by `resolveAdminOverride`, so use a Clerk session token belonging to an admin user; the API listens on `PORT=3001` per `apps/api/.env.example:6`:

```bash
curl -X POST http://localhost:3001/admin/feed/hydrate \
  -H "Authorization: Bearer <admin-clerk-session-token>" \
  -H "Content-Type: application/json" \
  -d '{"lanes":["refreshTrendingPapers"]}'
```

Expected: HTTP 200 with `scheduled: 1`. A 403 means the token is not an admin; a 409 (`hydration_in_progress`) means the 60s throttle lock is held — wait and retry. Confirm the worker logs a `refreshTrendingPapers` completion with a non-zero `written`.

- [ ] **Step 2: Verify the stored shape**

```bash
bun run db:studio
```

In `feed_items`, confirm at least one row has non-null `publication_date`, `oa_status`, `work_type`, and `language`, and that `key`, `snippet`, `has_pdf`, and `is_retracted` are populated.

- [ ] **Step 3: Verify the page**

```bash
bun dev
```

Open `/app/explore`. Confirm:
- the curated feed lists rows with an abstract excerpt, topic badges, open-access badge, citation count, and "PDF tersedia" where applicable;
- clicking a feed row opens `/app/explore/<key>`;
- "Tidak relevan" hides a row and it does not return on the next page load;
- entering a query switches to results whose rows are visually identical to feed rows;
- selecting rows in both states fills the batch bar and saving succeeds.

- [ ] **Step 4: Run the full gate**

```bash
bun run test
bun run typecheck
cd apps/svelte && bun run check
```

Expected: all pass except the known `@aqsha/web` baseline.

- [ ] **Step 5: Commit any fixes**

If the walkthrough surfaced a defect, fix it and commit with a message describing the defect, not the task.

---

## Notes for the implementer

- `apps/api` and `apps/agent` import `@aqsha/db` and `@aqsha/services` from `dist/`, not source. Run `bun run build:dist` after any change in those packages before running API tests or the dev stack, or keep `bun run watch:dist` going.
- Nothing in this plan adds a dependency.
- `apps/web` will show new TypeScript errors after Task 7. That is the accepted outcome recorded in the spec, not a defect to fix.
- If `bun run db:migrate` fails on Task 4 with a foreign-key violation, a legacy row escaped the purge predicate. Widen the `DELETE` predicates rather than dropping the constraints.
- `packages/services` does not compile between Task 4 and Task 5. Run `cd packages/db && bun test` as Task 4's gate, not the workspace-wide `bun run test`.
