import {
  type ChatThread,
  ChatMessageRepo,
  ChatThreadEventRepo,
  ChatThreadRepo,
  type Db,
  type DbOrTx,
  decodeKeysetCursor,
  ResearchSourceRepo,
  throwAppError,
} from "@aqsha/db";
import { collapse } from "../lib/text";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const TITLE_MAX = 120;
const ARCHIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // >1 hari sejak aktivitas terakhir → "older"
const STALE_STREAMING_THRESHOLD_MS = 30 * 60_000; // 30 mnt > gap subagent sah (~5,7 mnt); tunable

/** Bucket aktivitas thread untuk pengelompokan sidebar — dihitung server-side (BE). */
export type ThreadBucket = "recent" | "older";
export type ThreadListItem = ChatThread & { bucket: ThreadBucket };

/**
 * ThreadService — path BACA + CRUD non-stream thread Astra (Fase 6), dipakai route
 * api-v2 (Bun, tanpa bundling). Path TULIS proyeksi (ensure/record/status) hidup di
 * PROSES eve (`apps/web-v2/agent/lib/store.ts`, raw SQL) karena bundle eve tak bisa
 * mengonsumsi paket workspace TS-mentah — tak ada operasi yang tumpang-tindih.
 */
export const ThreadService = {
  /** Soft ownership: `null` bila missing/not-owned (BUKAN throw). Path route GET /:id. */
  async get(db: DbOrTx, ownerUserId: string, threadId: string): Promise<ChatThread | null> {
    const thread = await ChatThreadRepo.findById(db, threadId);
    if (!thread || thread.ownerUserId !== ownerUserId) return null;
    return thread;
  },

  /**
   * Thread `streaming` termuda milik caller — klien memakai ini untuk menemukan sessionId
   * turn PERTAMA segera setelah `send()` (lihat `ChatThreadRepo.findRecentActiveByOwner`),
   * lalu bump URL → refresh saat menyusun plan tak lagi kehilangan thread. `null` bila
   * belum ada (klien retry singkat sampai hook `session.started` membuat thread).
   */
  async recentActive(
    db: DbOrTx,
    ownerUserId: string,
    since?: number,
  ): Promise<ChatThread | null> {
    return ChatThreadRepo.findRecentActiveByOwner(db, ownerUserId, since);
  },

  /** Assert kepemilikan (rename/delete/messages). Missing/not-owned → 404. */
  async assertOwner(db: DbOrTx, ownerUserId: string, threadId: string): Promise<ChatThread> {
    const thread = await ChatThreadRepo.findById(db, threadId);
    if (!thread || thread.ownerUserId !== ownerUserId) {
      throwAppError({
        message: "Percakapan tidak ditemukan",
        code: "thread_not_found",
        severity: "error",
        status: 404,
      });
    }
    return thread;
  },

  /** List keyset milik owner, DESC aktivitas. Bucket recent/older dihitung di BE. */
  async list(
    db: DbOrTx,
    ownerUserId: string,
    args: { cursor?: string | null; limit?: number },
  ): Promise<{ items: ThreadListItem[]; nextCursor: string | null }> {
    const { items, nextCursor } = await ChatThreadRepo.listByOwner(db, {
      ownerUserId,
      limit: clampLimit(args.limit),
      cursor: decodeKeysetCursor(args.cursor),
    });
    const cutoff = Date.now() - ARCHIVE_THRESHOLD_MS;
    return {
      items: items.map((t) => ({
        ...t,
        bucket: t.lastActivityAt <= cutoff ? "older" : "recent",
      })),
      nextCursor,
    };
  },

  /** Rename manual (judul terminal → `titleStatus: "ready"` supaya auto-title tak menimpa). */
  async rename(
    db: DbOrTx,
    input: { ownerUserId: string; threadId: string; title: string },
  ): Promise<{ ok: true }> {
    const title = collapse(input.title);
    if (!title) {
      throwAppError({ message: "Judul wajib diisi.", code: "bad_request", severity: "warning" });
    }
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    await ChatThreadRepo.update(db, input.threadId, {
      title: title.length > TITLE_MAX ? title.slice(0, TITLE_MAX) : title,
      titleStatus: "ready",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /**
   * Tandai pesan terkirim yang turn-nya belum settle (baseline template `markChatPendingMessage`).
   * Ditulis klien sebelum `agent.send()` follow-up → recovery bubble user optimistik lintas-reload.
   * Recovery (null-kan saat ada event settled setelahnya) dihitung klien dari `events` (sudah
   * di-fetch) + `pendingUserMessageCreatedAt` — tak perlu query tambahan di sini.
   */
  async markPending(
    db: DbOrTx,
    input: { ownerUserId: string; threadId: string; message: string },
  ): Promise<{ ok: true }> {
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    const now = Date.now();
    await ChatThreadRepo.update(db, input.threadId, {
      pendingUserMessage: input.message,
      pendingUserMessageCreatedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },

  /** Bersihkan pending (kirim gagal / sudah dikonsumsi). Baseline template `clearChatPendingMessage`. */
  async clearPending(
    db: DbOrTx,
    input: { ownerUserId: string; threadId: string },
  ): Promise<{ ok: true }> {
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    await ChatThreadRepo.update(db, input.threadId, {
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /**
   * Upsert handle-resume eve (`continuationToken`) RACE-PROOF — dipanggil proxy-tee respons
   * create/continue eve (Phase 2), BUKAN klien. Token dari respons create-POST = ber-namespace
   * TUNGGAL (`eve:<uuid>`, nilai yang dipakai live) → approval HITL `inputResponses` + follow-up
   * lintas-reload bisa di-`deliver`. JANGAN pakai `channel.continuationToken` server (ganda
   * `eve:eve:…` → `createSendFn` menamespace lagi → `deliver` gagal "Cannot deliver").
   *
   * TANPA assertOwner: respons create (202) bisa mendahului hook `session.started` yang membuat
   * row → repo insert-if-absent (owner-guard di `setWhere`). Idempoten.
   */
  async upsertContinuationToken(
    db: DbOrTx,
    input: { ownerUserId: string; threadId: string; continuationToken: string },
  ): Promise<{ ok: true }> {
    await ChatThreadRepo.upsertContinuationToken(db, {
      id: input.threadId,
      ownerUserId: input.ownerUserId,
      continuationToken: input.continuationToken,
    });
    return { ok: true };
  },

  /**
   * Hapus thread, satu tx. FK `chat_messages` + `research_sources` ber-`onDelete` no-action
   * → wajib dihapus dulu (kalau tidak, thread hasil `/deep` yang punya sumber → FK violation
   * → 500 "tak terduga"). `chat_thread_events` punya cascade, jadi tak perlu manual.
   */
  async remove(db: Db, input: { ownerUserId: string; threadId: string }): Promise<{ ok: true }> {
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    await db.transaction(async (tx) => {
      await ChatMessageRepo.deleteByThread(tx, input.threadId);
      await ResearchSourceRepo.deleteByThread(tx, input.threadId);
      await ChatThreadRepo.deleteById(tx, input.threadId);
    });
    return { ok: true };
  },

  /**
   * Reconciler thread "zombie" (Phase 5, fix E) — dipanggil cron worker `reconcile-stale-threads`.
   * Turn crash (ENOSPC / restart / dev) meninggalkan `status='streaming'` TANPA event terminal →
   * composer terkunci selamanya (klien tebak status dari event terakhir, refresh tak menolong).
   * Untuk tiap thread basi (`findStaleStreaming`: streaming + last_activity basi + tanpa event sejak
   * cutoff): (1) append event terminal sintetik `turn.failed` → `isStreamActive(base)` false (klien
   * unlock composer), (2) `status='failed'` → DB & heuristik klien selaras. KEDUANYA wajib — status
   * saja → heuristik event-terakhir klien & DB divergen (plan Traps). Per-thread satu tx (idempoten).
   */
  async reconcileStaleStreaming(
    db: Db,
    opts?: { thresholdMs?: number },
  ): Promise<{ reconciled: number }> {
    const cutoff = Date.now() - (opts?.thresholdMs ?? STALE_STREAMING_THRESHOLD_MS);
    const stale = await ChatThreadRepo.findStaleStreaming(db, cutoff);
    for (const thread of stale) {
      await db.transaction(async (tx) => {
        await ChatThreadEventRepo.appendTerminal(tx, {
          threadId: thread.id,
          ownerUserId: thread.ownerUserId,
          type: "turn.failed",
        });
        await ChatThreadRepo.update(tx, thread.id, { status: "failed", updatedAt: Date.now() });
      });
    }
    return { reconciled: stale.length };
  },
};

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(limit)));
}
