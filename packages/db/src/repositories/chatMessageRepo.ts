import { asc, eq } from "drizzle-orm";
import { type ChatMessage, chatMessages, type NewChatMessage } from "../schema/chatMessages";
import type { DbOrTx } from "../types";

/** Repo chat_messages — query Drizzle saja. */
export const ChatMessageRepo = {
  /** Transkrip thread, ASC `(createdAt, id)` (kronologis). Port V1 `by_thread_created`. */
  async listByThread(db: DbOrTx, threadId: string): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  },

  /**
   * Upsert idempoten by PK deterministik. Step durable yang RE-RUN saat resume tak
   * menduplikasi pesan; teks/reasoning/status final menang (`onConflictDoUpdate`).
   */
  async upsert(db: DbOrTx, row: NewChatMessage): Promise<void> {
    await db
      .insert(chatMessages)
      .values(row)
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: { text: row.text, reasoning: row.reasoning ?? null, status: row.status ?? "complete" },
      });
  },

  async deleteByThread(db: DbOrTx, threadId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.threadId, threadId));
  },
};
