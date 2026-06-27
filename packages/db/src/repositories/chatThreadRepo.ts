import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
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
   * Insert idempoten (proyeksi `threadProjectionProcessor` bisa fire >1x; idempoten per thread).
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

  /**
   * Klaim atomik generasi auto-title (Slice 6.8). `title_status: null → 'generating'`
   * via guard `where title_status IS NULL` → `RETURNING` → hanya satu pemanggil yang
   * "menang". `true` ⇒ klaim baru: turn pertama (status masih null) DAN belum di-rename
   * manual (rename set 'ready'). Turn ke-2+ / sudah ready → 0 baris → `false` (skip enqueue).
   */
  async claimTitleGeneration(db: DbOrTx, id: string): Promise<boolean> {
    const rows = await db
      .update(chatThreads)
      .set({ titleStatus: "generating", updatedAt: Date.now() })
      .where(and(eq(chatThreads.id, id), isNull(chatThreads.titleStatus)))
      .returning({ id: chatThreads.id });
    return rows.length > 0;
  },

  /**
   * Tulis judul hasil generasi (Slice 6.8) — guard `title_status = 'generating'` supaya
   * rename manual yang terjadi ANTARA claim↔generate (sudah set 'ready') tak ketimpa.
   * `false` ⇒ tak ada baris ber-status 'generating' (sudah di-rename) → judul dibuang.
   */
  async finalizeTitle(db: DbOrTx, id: string, title: string): Promise<boolean> {
    const rows = await db
      .update(chatThreads)
      .set({ title, titleStatus: "ready", updatedAt: Date.now() })
      .where(and(eq(chatThreads.id, id), eq(chatThreads.titleStatus, "generating")))
      .returning({ id: chatThreads.id });
    return rows.length > 0;
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
