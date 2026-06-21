import { and, desc, eq, lt, or } from "drizzle-orm";
import { type ChatThread, chatThreads, type NewChatThread } from "../schema/chatThreads";
import { type KeysetCursor, encodeKeysetCursor } from "../cursor";
import type { DbOrTx } from "../types";

/** Repo chat_threads — query Drizzle saja (ownership/now/id di service). */
export const ChatThreadRepo = {
  async findById(db: DbOrTx, id: string): Promise<ChatThread | null> {
    const rows = await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
    return rows[0] ?? null;
  },

  /**
   * Insert idempoten (hook proyeksi bisa fire `session.started` >1x saat resume).
   * `onConflictDoNothing` pada PK → `true` bila baris benar-benar baru.
   */
  async insertIfAbsent(db: DbOrTx, row: NewChatThread): Promise<boolean> {
    const inserted = await db
      .insert(chatThreads)
      .values(row)
      .onConflictDoNothing({ target: chatThreads.id })
      .returning({ id: chatThreads.id });
    return inserted.length > 0;
  },

  async update(db: DbOrTx, id: string, patch: Partial<NewChatThread>): Promise<void> {
    await db.update(chatThreads).set(patch).where(eq(chatThreads.id, id));
  },

  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(chatThreads).where(eq(chatThreads.id, id));
  },

  /** List keyset milik owner, DESC `(lastActivityAt, id)`. `{ items, nextCursor }`. */
  async listByOwner(
    db: DbOrTx,
    args: { ownerUserId: string; limit: number; cursor: KeysetCursor | null },
  ): Promise<{ items: ChatThread[]; nextCursor: string | null }> {
    const ownerFilter = eq(chatThreads.ownerUserId, args.ownerUserId);
    const keyset = args.cursor
      ? or(
          lt(chatThreads.lastActivityAt, args.cursor.u),
          and(eq(chatThreads.lastActivityAt, args.cursor.u), lt(chatThreads.id, args.cursor.i)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(chatThreads)
      .where(keyset ? and(ownerFilter, keyset) : ownerFilter)
      .orderBy(desc(chatThreads.lastActivityAt), desc(chatThreads.id))
      .limit(args.limit + 1);

    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.lastActivityAt, i: last.id }) : null;
    return { items, nextCursor };
  },
};
