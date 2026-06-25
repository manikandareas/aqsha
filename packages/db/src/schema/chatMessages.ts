import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { chatThreads } from "./chatThreads";
import { users } from "./users";

/**
 * chat_messages — pesan dalam satu thread Astra (Fase 6). Port `chatMessages` V1.
 *
 * - `id` (PK) **deterministik** (di-generate service dari `sessionId:turnId:role[:stepIndex]`)
 *   supaya proyeksi hook idempoten: step eve yang ter-interrupt RE-RUN saat resume
 *   durable (plan §2.6) → upsert, bukan duplikat.
 * - `threadId` FK → `chat_threads.id` (= eve session id).
 * - `role` text + CHECK (user|assistant|system). `status` text + CHECK
 *   (streaming|complete|error) — lifecycle pesan.
 * - `reasoning` (nullable) — capture extended-thinking (pipeline penuh di Slice 6.3;
 *   kolom additive di sini).
 * - Urutan kronologis lewat `createdAt` (port V1: `by_thread_created`); `seq` hidup di
 *   `agent_run_events` (slice lanjutan), bukan di sini.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    role: text("role").notNull(),
    text: text("text").notNull(),
    reasoning: text("reasoning"),
    status: text("status").notNull().default("complete"),
    turnId: text("turn_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("chat_messages_role_check", sql`${t.role} in ('user', 'assistant', 'system')`),
    check(
      "chat_messages_status_check",
      sql`${t.status} in ('streaming', 'complete', 'error')`,
    ),
    index("chat_messages_by_thread_created").on(t.threadId, t.createdAt),
  ],
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
