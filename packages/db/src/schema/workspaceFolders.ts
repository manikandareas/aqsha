import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * workspace_folders — folder owner-scoped di dalam sebuah workspace (P2). Port
 * dari V1 `workspaceFolders`.
 *
 * - `id` (PK) di-generate aplikasi (`crypto.randomUUID()` di repo), seragam dengan
 *   tabel V2 lain.
 * - `status` text + CHECK (active|deleted) — port `v.union(v.literal(...))` V1;
 *   delete = soft (`status="deleted"`, `deletedAt`).
 * - Index mirror V1: `by_owner_workspace_status_updated` (list aktif) +
 *   `by_owner_workspace_name` (dedupe nama unik per owner+workspace).
 */
export const workspaceFolders = pgTable(
  "workspace_folders",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
  },
  (t) => [
    check("workspace_folders_status_check", sql`${t.status} in ('active', 'deleted')`),
    index("workspace_folders_by_owner_workspace_status_updated").on(
      t.ownerUserId,
      t.workspaceId,
      t.status,
      t.updatedAt,
    ),
    index("workspace_folders_by_owner_workspace_name").on(
      t.ownerUserId,
      t.workspaceId,
      t.name,
    ),
  ],
);

export type WorkspaceFolder = typeof workspaceFolders.$inferSelect;
export type NewWorkspaceFolder = typeof workspaceFolders.$inferInsert;
