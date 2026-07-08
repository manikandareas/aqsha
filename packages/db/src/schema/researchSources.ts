import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { chatThreads } from "./chatThreads";
import { users } from "./users";

/**
 * research_sources — bukti web/arxiv/doi yang dikumpulkan tool riset Astra.
 * Satu row per kandidat sumber yang dipersist saat `search_web` /
 * `search_arxiv` / `lookup_doi` berjalan, di-scope ke percakapan (`thread_id`) dan
 * giliran (`turn_id`) → key by `thread_id + turn_id`. Pada run `/deep`,
 * `turn_id` diisi workflow runId.
 *
 * - `origin` text + CHECK (web|arxiv|doi) — kelas sumber.
 * - `evidence_strength` text + CHECK (strong|medium|weak) — taksiran kekuatan bukti kandidat.
 * - `citation_number` opsional — nomor sitasi [n] global: jalur chat mengisinya saat persist,
 *   run `/deep` mengisinya belakangan via step `assign-citations` (dedup lintas sub-pertanyaan).
 * - `sub_question_index`/`sub_question_text` opsional — asosiasi sumber ke sub-pertanyaan riset
 *   `/deep` (di-set step `search-literature` via RequestContext) → FE mengelompokkan kartu per
 *   sub-agen pencarian. Null di jalur chat biasa (bukan `/deep`).
 * - `image_url` opsional — OG image best-effort yang di-enrich step search (`fetchSourcePreview`)
 *   untuk kartu sumber. Favicon + domain TIDAK disimpan (diturunkan client-side dari `url`).
 * - Idempotensi insert: unique (`thread_id`,`turn_id`,`locator`) → step tool yang RE-RUN
 *   saat resume durable tak menggandakan baris (ON CONFLICT DO NOTHING di repo).
 * - timestamp epoch-ms (`bigint`) seragam dengan tabel lain di skema ini.
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
    // Metadata sitasi terstruktur: authors (JSON array string, maks 3), tahun, venue —
    // diekstrak dari `metadataJson` provider saat persist → inventory [n] + verify_identifiers
    // menerima author/year asli, bukan mengarang. Nullable (provider web sering tanpa metadata).
    authorsJson: text("authors_json"),
    year: integer("year"),
    venue: text("venue"),
    // Kolom metadata + klasifikasi evidence viz `/deep` (migration `0027_milky_wolfpack`;
    // CHECK `research_sources_stance_check`/`research_sources_study_design_check` di bawah).
    // `cited_by_count`/`topics_json` diisi saat persist dari metadata provider (OpenAlex
    // `cited_by_count`+`topics`, Crossref `is-referenced-by-count`);
    // `stance`/`study_design`/`outcomes_json` diisi step
    // `analyze-sources` (klasifikasi LLM, best-effort). Semua nullable — jalur chat biasa
    // dan run lama tak tersentuh.
    citedByCount: integer("cited_by_count"),
    topicsJson: text("topics_json"),
    stance: text("stance"),
    studyDesign: text("study_design"),
    outcomesJson: text("outcomes_json"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("research_sources_origin_check", sql`${t.origin} in ('web', 'arxiv', 'doi')`),
    check(
      "research_sources_evidence_strength_check",
      sql`${t.evidenceStrength} in ('strong', 'medium', 'weak')`,
    ),
    check(
      "research_sources_stance_check",
      sql`${t.stance} is null or ${t.stance} in ('yes', 'possibly', 'mixed', 'no', 'not_applicable')`,
    ),
    check(
      "research_sources_study_design_check",
      sql`${t.studyDesign} is null or ${t.studyDesign} in ('meta_analysis', 'systematic_review', 'rct', 'observational', 'review', 'other')`,
    ),
    index("research_sources_by_thread").on(t.threadId, t.createdAt),
    uniqueIndex("research_sources_thread_turn_locator").on(t.threadId, t.turnId, t.locator),
  ],
);

export type ResearchSource = typeof researchSources.$inferSelect;
export type NewResearchSource = typeof researchSources.$inferInsert;

/**
 * Nilai valid kolom `stance`/`study_design` — WAJIB sama persis dengan CHECK constraint di atas
 * (dan migration yang menurunkannya). Kontrak viz `@aqsha/chat-core/deep-viz` memuat vocab yang
 * sama; chat-core tak boleh depend db (dipakai web) dan sebaliknya, jadi kesamaannya ditegakkan
 * test lintas-paket di `packages/services` (depend keduanya) — bukan disinkron manual.
 */
export const RESEARCH_SOURCE_STANCES = [
  "yes",
  "possibly",
  "mixed",
  "no",
  "not_applicable",
] as const;
export type ResearchSourceStance = (typeof RESEARCH_SOURCE_STANCES)[number];

export const RESEARCH_SOURCE_STUDY_DESIGNS = [
  "meta_analysis",
  "systematic_review",
  "rct",
  "observational",
  "review",
  "other",
] as const;
export type ResearchSourceStudyDesign = (typeof RESEARCH_SOURCE_STUDY_DESIGNS)[number];
