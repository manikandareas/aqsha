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
