import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * chat_threads — satu percakapan Astra (Fase 6). Port `chatThreads` V1.
 *
 * - `id` (PK) == **eve session id**. eve men-mint session id sendiri (server-side)
 *   pada turn pertama; klien menerimanya lewat `onSessionChange`. Memakai session id
 *   sebagai PK menghilangkan friksi join thread↔session (tanpa kolom `eve_session_id`
 *   terpisah + tanpa race rekonsiliasi). Thread di-CREATE oleh hook proyeksi eve
 *   (observe-only) saat `session.started`, BUKAN oleh route api-v2.
 * - `status` text + CHECK (idle|streaming|failed) — `streaming` mengunci composer,
 *   `failed` memunculkan banner retry.
 * - `titleStatus` text + CHECK (null|generating|ready) — klaim siklus auto-title
 *   (generasi judul landing Slice 6.8; di 6.1 selalu null/`Percakapan baru`).
 * - `agentKind` text + CHECK (lite|pro) — Lite-first (D-B); Pro landing slice lanjutan.
 * - timestamp epoch-ms (`bigint`) seragam dengan tabel V2 lain.
 */
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    title: text("title"),
    titleStatus: text("title_status"),
    status: text("status").notNull().default("idle"),
    agentKind: text("agent_kind").notNull().default("lite"),
    lastMessagePreview: text("last_message_preview"),
    lastActivityAt: bigint("last_activity_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("chat_threads_status_check", sql`${t.status} in ('idle', 'streaming', 'failed')`),
    check(
      "chat_threads_title_status_check",
      sql`${t.titleStatus} is null or ${t.titleStatus} in ('generating', 'ready')`,
    ),
    check("chat_threads_agent_kind_check", sql`${t.agentKind} in ('lite', 'pro')`),
    index("chat_threads_by_owner_activity").on(t.ownerUserId, t.lastActivityAt),
  ],
);

export type ChatThread = typeof chatThreads.$inferSelect;
export type NewChatThread = typeof chatThreads.$inferInsert;
