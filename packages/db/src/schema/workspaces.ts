import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";

export const WORKSPACE_KINDS = [
  "undergraduate_thesis",
  "masters_thesis",
  "dissertation",
  "journal_article",
  "proposal",
  "paper",
  "freeform",
] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

/**
 * Metadata per-kind yang dikumpulkan saat proyek dibuat, disimpan di kolom jsonb
 * `workspaces.kind_info`. Semua field opsional; service memvalidasi bahwa hanya field
 * yang relevan untuk `kind` proyek yang dipersist (lihat WORKSPACE_KIND_INFO_FIELDS).
 * Bentuk tersimpan = superset flat di bawah; halaman judul scaffold membacanya per kind.
 */
export type WorkspaceKindInfo = {
  university?: string | null;
  faculty?: string | null;
  studyProgram?: string | null;
  targetJournal?: string | null;
  affiliation?: string | null;
  courseOrVenue?: string | null;
};

/** Field kind_info yang boleh diisi per kind — dipakai validasi service + rendering form. */
export const WORKSPACE_KIND_INFO_FIELDS = {
  undergraduate_thesis: ["university", "faculty", "studyProgram"],
  masters_thesis: ["university", "faculty", "studyProgram"],
  dissertation: ["university", "faculty", "studyProgram"],
  proposal: ["university", "faculty", "studyProgram"],
  journal_article: ["targetJournal", "affiliation"],
  paper: ["university", "courseOrVenue"],
  freeform: [],
} as const satisfies Record<WorkspaceKind, readonly (keyof WorkspaceKindInfo)[]>;

/**
 * workspaces — proyek karya tulis (skripsi/tesis/disertasi/artikel jurnal/
 * proposal/makalah) milik satu owner. `kind='freeform'` = workspace polos tanpa
 * kerangka bab.
 *
 * - `id` (PK) di-generate aplikasi (`crypto.randomUUID()` di repo) supaya seragam
 *   dengan id eksternal lain dan diketahui sebelum insert.
 * - `kind` immutable setelah create — ganti jenis = proyek baru.
 * - `name` boleh string kosong; `topic_note` jadi placeholder judul di UI.
 * - `document_artifact_id` = satu dokumen Typst kontinu proyek (nullable; dibuat lazy
 *   saat scaffold/tulis pertama). `kind_info` = metadata per-kind (bentuk divalidasi service).
 * - `status` text + CHECK (active|archived).
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    description: text("description"),
    kind: text("kind").notNull().default("freeform"),
    kindInfo: jsonb("kind_info").$type<WorkspaceKindInfo>(),
    // AnyPgColumn memutus siklus inferensi tipe: workspaces↔artifacts saling ber-FK.
    documentArtifactId: text("document_artifact_id").references((): AnyPgColumn => artifacts.id, {
      onDelete: "set null",
    }),
    deadline: bigint("deadline", { mode: "number" }),
    topicNote: text("topic_note"),
    status: text("status").notNull().default("active"),
    archivedAt: bigint("archived_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("workspaces_status_check", sql`${t.status} in ('active', 'archived')`),
    check(
      "workspaces_kind_check",
      sql`${t.kind} in ('undergraduate_thesis', 'masters_thesis', 'dissertation', 'journal_article', 'proposal', 'paper', 'freeform')`,
    ),
    index("workspaces_by_owner_status_updated").on(t.ownerUserId, t.status, t.updatedAt),
    index("workspaces_by_owner_updated").on(t.ownerUserId, t.updatedAt),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
