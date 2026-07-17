import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
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

export const WORKSPACE_STAGES = [
  "exploration",
  "proposal",
  "research",
  "writing",
  "revision",
  "done",
] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];

/**
 * workspaces — proyek karya tulis (skripsi/tesis/disertasi/artikel jurnal/
 * proposal/makalah) milik satu owner. `kind='freeform'` = workspace polos tanpa
 * kerangka bab & stepper tahap.
 *
 * - `id` (PK) di-generate aplikasi (`crypto.randomUUID()` di repo) supaya seragam
 *   dengan id eksternal lain di V2 dan diketahui sebelum insert.
 * - `kind` immutable setelah create — ganti jenis = proyek baru.
 * - `name` boleh string kosong selama tahap exploration; `topic_note` jadi
 *   placeholder judul di UI.
 * - `status` text + CHECK (active|archived) — port `v.union(v.literal(...))` V1.
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
    stage: text("stage").notNull().default("exploration"),
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
    check(
      "workspaces_stage_check",
      sql`${t.stage} in ('exploration', 'proposal', 'research', 'writing', 'revision', 'done')`,
    ),
    index("workspaces_by_owner_status_updated").on(t.ownerUserId, t.status, t.updatedAt),
    index("workspaces_by_owner_updated").on(t.ownerUserId, t.updatedAt),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
