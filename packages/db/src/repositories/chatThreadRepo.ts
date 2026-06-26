import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
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
   * Thread `streaming` TERMUDA milik owner (DESC `lastActivityAt`). Dipakai klien untuk
   * menemukan sessionId turn PERTAMA segera setelah `send()` — `useEveAgent` baru surface
   * sessionId di akhir turn (`onSessionChange`), jadi tanpa ini refresh saat menyusun plan
   * mendarat di halaman kosong. Karena composer serial (satu turn aktif per user), thread
   * streaming termuda == yang baru dibuat hook `session.started`.
   *
   * `since` (opsional, epoch ms) menyaring `lastActivityAt >= since` supaya thread `streaming`
   * BASI lama (turn mati tanpa settle) tak salah dikira thread baru → klien teruskan timestamp
   * SEBELUM `send()`.
   */
  async findRecentActiveByOwner(
    db: DbOrTx,
    ownerUserId: string,
    since?: number,
  ): Promise<ChatThread | null> {
    const filters = [eq(chatThreads.ownerUserId, ownerUserId), eq(chatThreads.status, "streaming")];
    if (since !== undefined) filters.push(gte(chatThreads.lastActivityAt, since));
    const rows = await db
      .select()
      .from(chatThreads)
      .where(and(...filters))
      .orderBy(desc(chatThreads.lastActivityAt), desc(chatThreads.id))
      .limit(1);
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

  /**
   * Upsert continuation token RACE-PROOF (Phase 2 proxy-tee). Respons create-POST eve (202)
   * mendahului hook `session.started` yang membuat row, jadi row bisa BELUM ada → insert-if-absent
   * (row minimal milik caller; owner = Clerk sub = eve principalId). Bila row sudah ada → update
   * token saja, `setWhere owner` mencegah caller lain menimpa token thread bukan miliknya
   * (id = ULID tak-bisa-ditebak; defensif). TIDAK menyentuh `status` saat update (jangan timpa
   * lifecycle turn). Idempoten + tanpa assertOwner (row mungkin belum ada).
   */
  async upsertContinuationToken(
    db: DbOrTx,
    input: { id: string; ownerUserId: string; continuationToken: string },
  ): Promise<void> {
    const now = Date.now();
    await db
      .insert(chatThreads)
      .values({
        id: input.id,
        ownerUserId: input.ownerUserId,
        status: "streaming",
        agentKind: "lite",
        continuationToken: input.continuationToken,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: chatThreads.id,
        set: { continuationToken: input.continuationToken, updatedAt: now },
        setWhere: eq(chatThreads.ownerUserId, input.ownerUserId),
      });
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

  /**
   * Thread "zombie" (Phase 5, fix E): `status='streaming'` yang turn-nya MATI mid-stream (crash /
   * ENOSPC / dev restart) tanpa menulis event terminal → klien `isStreamActive` true selamanya
   * (composer terkunci, refresh tak menolong). Kandidat = `streaming` + `last_activity_at < cutoff`
   * (plan: ambang 30 mnt > gap subagent sah ~5,7 mnt).
   *
   * Guard `not exists (event >= cutoff)`: cegah FALSE-POSITIVE — `last_activity_at` hanya di-bump
   * oleh message.completed, jadi turn yang masih hidup tapi sedang stream token (delta `*.appended`
   * tiap ~330ms) atau tool/subagent bisa terlihat "basi" oleh last_activity_at saja. Event-recency
   * memastikan kita hanya reconcile turn yang BENAR-BENAR diam (tak ada event apa pun sejak cutoff)
   * — reconcile turn hidup = data loss (turn mahal ter-corrupt), jadi guard ini wajib.
   */
  async findStaleStreaming(db: DbOrTx, cutoff: number): Promise<ChatThread[]> {
    return db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.status, "streaming"),
          lt(chatThreads.lastActivityAt, cutoff),
          sql`not exists (select 1 from chat_thread_events e where e.thread_id = ${chatThreads.id} and e.created_at >= ${cutoff})`,
        ),
      );
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
