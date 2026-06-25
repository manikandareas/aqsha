import { asc, eq } from "drizzle-orm";
import { type ChatThreadEvent, chatThreadEvents } from "../schema/chatThreadEvents";
import type { DbOrTx } from "../types";

/** Repo chat_thread_events — BACA saja (tulis via raw SQL di PROSES eve). */
export const ChatThreadEventRepo = {
  /** Event stream thread, urut `event_index` ASC (= posisi stream eve; cursor resume klien). */
  async listByThread(db: DbOrTx, threadId: string): Promise<ChatThreadEvent[]> {
    return db
      .select()
      .from(chatThreadEvents)
      .where(eq(chatThreadEvents.threadId, threadId))
      .orderBy(asc(chatThreadEvents.eventIndex));
  },
};
