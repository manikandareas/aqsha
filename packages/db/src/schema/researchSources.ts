import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { chatThreads } from "./chatThreads";
import { users } from "./users";

/**
 * research_sources — bukti web/arxiv/doi yang dikumpulkan tool riset Astra (Fase 6,
 * Slice 6.4). Satu row per kandidat sumber yang dipersist saat `search_web` /
 * `search_arxiv` / `lookup_doi` berjalan, di-scope ke percakapan (`thread_id`) dan
 * giliran (`turn_id`). V2 TIDAK punya konsep `runId` (V1 Convex) → key by
 * `thread_id + turn_id`.
 *
 * - `origin` text + CHECK (web|arxiv|doi) — kelas sumber.
 * - `evidence_strength` text + CHECK (strong|medium|weak) — port dari ExternalCandidate V1.
 * - `citation_number` opsional — penomoran [n] global ditunda ke P7 (citation verify, D-H);
 *   di 6.4 dibiarkan null, panel Sources menomori berdasar urutan.
 * - `sub_question_index`/`sub_question_text` opsional — asosiasi sumber ke sub-pertanyaan riset
 *   `/deep` (di-set step `search-literature` via RequestContext) → FE mengelompokkan kartu per
 *   sub-agen pencarian. Null di jalur chat biasa (bukan `/deep`).
 * - `image_url` opsional — OG image best-effort yang di-enrich step search (`fetchSourcePreview`)
 *   untuk kartu sumber. Favicon + domain TIDAK disimpan (diturunkan client-side dari `url`).
 * - Idempotensi insert: unique (`thread_id`,`turn_id`,`locator`) → step tool yang RE-RUN
 *   saat resume eve tak menggandakan baris (ON CONFLICT DO NOTHING di repo).
 * - timestamp epoch-ms (`bigint`) seragam dengan tabel V2 lain.
 */
export const researchSources = pgTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    citationNumber: integer("citation_number"),
    origin: text("origin").notNull(),
    provider: text("provider"),
    title: text("title").notNull(),
    locator: text("locator").notNull(),
    url: text("url"),
    doi: text("doi"),
    arxivId: text("arxiv_id"),
    snippet: text("snippet").notNull(),
    evidenceStrength: text("evidence_strength").notNull(),
    discoveryQuery: text("discovery_query"),
    subQuestionIndex: integer("sub_question_index"),
    subQuestionText: text("sub_question_text"),
    imageUrl: text("image_url"),
    // Metadata sitasi terstruktur (CTX-8): authors (JSON array string, maks 3), tahun, venue —
    // diekstrak dari `metadataJson` provider saat persist → inventory [n] + verify_identifiers
    // menerima author/year asli, bukan mengarang. Nullable (provider web sering tanpa metadata).
    authorsJson: text("authors_json"),
    year: integer("year"),
    venue: text("venue"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("research_sources_origin_check", sql`${t.origin} in ('web', 'arxiv', 'doi')`),
    check(
      "research_sources_evidence_strength_check",
      sql`${t.evidenceStrength} in ('strong', 'medium', 'weak')`,
    ),
    index("research_sources_by_thread").on(t.threadId, t.createdAt),
    uniqueIndex("research_sources_thread_turn_locator").on(t.threadId, t.turnId, t.locator),
  ],
);

export type ResearchSource = typeof researchSources.$inferSelect;
export type NewResearchSource = typeof researchSources.$inferInsert;
