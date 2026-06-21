import { bigint, boolean, check, doublePrecision, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * explore_papers — cache paper bersama (P4). Port V1 `explorePapers` (explorePaperFields
 * + lastSeenAt). PK = `key` (canonical scheme `doi:`/`arxiv:`/`title:`), satu baris per
 * paper, di-rujuk `feed_items.paper_key` SEBAGAI logical ref (BUKAN FK keras — feed item
 * boleh ditulis sebelum paper ter-cache, dan cache boleh di-purge tanpa men-cascade feed).
 *
 * Provider Title-case (`OpenAlex|arXiv|Exa|Jina|Crossref`) — BERBEDA dari provider feed_items
 * (lowercase). `lastSeenAt` di-bump tiap upsert cache (PaperCacheService, monotonik).
 */
export const explorePapers = pgTable(
  "explore_papers",
  {
    key: text("key").primaryKey(),
    title: text("title").notNull(),
    snippet: text("snippet").notNull(),
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
    topics: text("topics").array().notNull().default(sql`'{}'`),
    score: doublePrecision("score"),
    lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "explore_papers_provider_check",
      sql`${t.provider} in ('OpenAlex', 'arXiv', 'Exa', 'Jina', 'Crossref')`,
    ),
    index("explore_papers_by_doi").on(t.doi),
  ],
);

export type ExplorePaper = typeof explorePapers.$inferSelect;
export type NewExplorePaper = typeof explorePapers.$inferInsert;
