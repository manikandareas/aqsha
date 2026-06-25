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
    // Resume handle eve (Slice fix): dipersist tiap `session.waiting` oleh channel agent.
    // Follow-up di thread yang di-reload WAJIB continuationToken (eve menolak tanpa-token);
    // di-rehydrate ke `initialSession` saat ThreadView mount. Null sampai turn pertama parkir.
    continuationToken: text("continuation_token"),
    // Recovery pesan terkirim yang turn-nya belum settle (baseline template eve-chat). Ditulis
    // klien sebelum `agent.send()`; di-null-kan saat ada event settled setelah `_created_at`
    // (lihat ThreadService.getActiveChat) → render bubble user optimistik lintas-reload.
    pendingUserMessage: text("pending_user_message"),
    pendingUserMessageCreatedAt: bigint("pending_user_message_created_at", { mode: "number" }),
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
