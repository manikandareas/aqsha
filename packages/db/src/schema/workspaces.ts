import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * workspaces — kontainer owner-scoped untuk artefak (P3+). Di P1 hanya default
 * workspace "Workspace Saya" yang dibuat cold-start saat provisioning user.
 *
 * - `id` (PK) di-generate aplikasi (`crypto.randomUUID()` di repo) supaya seragam
 *   dengan id eksternal lain di V2 dan diketahui sebelum insert.
 * - `status` text + CHECK (active|archived) — port `v.union(v.literal(...))` V1.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    name: text("name").notNull(),
    emoji: text("emoji"),
    description: text("description"),
    status: text("status").notNull().default("active"),
    archivedAt: bigint("archived_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("workspaces_status_check", sql`${t.status} in ('active', 'archived')`),
    index("workspaces_by_owner_status_updated").on(t.ownerUserId, t.status, t.updatedAt),
    index("workspaces_by_owner_updated").on(t.ownerUserId, t.updatedAt),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
