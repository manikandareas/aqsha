import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Postgres `tsvector` (drizzle pg-core tak punya tipe bawaan). Dipakai untuk kolom
 * full-text GENERATED + index GIN (Isu 7 / searchDiscovery). pgvector KHUSUS RAG (P3),
 * full-text feed KHUSUS tsvector — jangan dicampur.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * feed_items — surface discovery cross-kind (P4). Port V1 `feedItems` (feedItemFields +
 * orderAt + searchText). Fields denormalized supaya kartu render tanpa join.
 *
 * - `order_at` bigint NOT NULL → kunci sort total untuk keyset infinite scroll
 *   (getFeedPaginated by_order). DIISI `deriveOrderAt` di SETIAP write.
 * - `search_text` (blob title+summary+topics) + `search_tsv` GENERATED tsvector +
 *   index GIN → back searchDiscovery. DIISI `deriveSearchText` di SETIAP write.
 * - `paper_key` = logical ref ke `explore_papers.key` (TANPA FK keras; lihat explorePapers.ts).
 * - Enum (kind/provider/retraction) = text + CHECK. provider LOWERCASE (beda dari explore_papers).
 * - `stance_supporting`/`stance_contrasting` di-keep nullable demi kontrak FeedItem; TIDAK
 *   ditulis di P4 (fitur consensus dibuang — owner decision).
 */
export const feedItems = pgTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    tldr: text("tldr"),
    tldrId: text("tldr_id"),
    titleId: text("title_id"),
    url: text("url").notNull(),
    resolvedUrl: text("resolved_url"),
    imageUrl: text("image_url"),
    articleText: text("article_text"),
    enrichAttempts: integer("enrich_attempts"),
    provider: text("provider").notNull(),
    sourceLabel: text("source_label").notNull(),
    paperKey: text("paper_key"),
    doi: text("doi"),
    authors: text("authors").array(),
    year: integer("year"),
    venue: text("venue"),
    pdfUrl: text("pdf_url"),
    citedByCount: integer("cited_by_count"),
    isOpenAccess: boolean("is_open_access"),
    topics: text("topics").array().notNull().default(sql`'{}'`),
    trendScore: doublePrecision("trend_score").notNull(),
    retractionStatus: text("retraction_status"),
    primaryClaim: jsonb("primary_claim"),
    stanceSupporting: integer("stance_supporting"),
    stanceContrasting: integer("stance_contrasting"),
    sparkline: real("sparkline").array(),
    publishedAt: bigint("published_at", { mode: "number" }),
    dedupeKey: text("dedupe_key").notNull(),
    lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    orderAt: bigint("order_at", { mode: "number" }).notNull(),
    searchText: text("search_text"),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(search_text, ''))`,
    ),
  },
  (t) => [
    check("feed_items_kind_check", sql`${t.kind} in ('paper', 'news', 'claim', 'topic', 'idea')`),
    check(
      "feed_items_provider_check",
      sql`${t.provider} in ('openalex', 'exa_news', 'google_news', 'gdelt', 'google_factcheck', 'turnbackhoax')`,
    ),
    check(
      "feed_items_retraction_status_check",
      sql`${t.retractionStatus} is null or ${t.retractionStatus} in ('none', 'concern', 'retracted')`,
    ),
    uniqueIndex("feed_items_by_dedupe_key").on(t.dedupeKey),
    index("feed_items_by_kind_trend").on(t.kind, t.trendScore),
    index("feed_items_by_kind_published").on(t.kind, t.publishedAt),
    index("feed_items_by_order").on(t.orderAt, t.id),
    index("feed_items_by_paper_key").on(t.paperKey),
    index("feed_items_search_gin").using("gin", t.searchTsv),
  ],
);

export type FeedItem = typeof feedItems.$inferSelect;
export type NewFeedItem = typeof feedItems.$inferInsert;
