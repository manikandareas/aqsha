import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * chat_threads — metadata satu percakapan Astra (sidebar/billing list). Isi pesan = Mastra
 * Memory (`mastra_*`); tabel ini HANYA proyeksi tipis.
 *
 * - `id` (PK) == **Mastra memory thread id** (ditentukan klien sebelum kirim). Baris di-UPSERT
 *   oleh `threadProjectionProcessor` agent Mastra (outputProcessor) per turn, BUKAN oleh route api.
 * - `status` text + CHECK (idle|streaming|failed) — proyeksi Mastra menulis `idle`; `streaming`/
 *   `failed` tersisa dari kompat schema.
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
