import {
  type ChatThread,
  ChatMessageRepo,
  ChatThreadRepo,
  type Db,
  type DbOrTx,
  decodeKeysetCursor,
  throwAppError,
} from "@aqsha/db";
import { collapse } from "../lib/text";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const TITLE_MAX = 120;
const ARCHIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // >1 hari sejak aktivitas terakhir → "older"

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
   * Persist handle-resume eve (`continuationToken`) dari KLIEN (`onSessionChange`). WAJIB
   * pakai token KLIEN, bukan `channel.continuationToken` server: yang server ter-namespace
   * GANDA (`eve:eve:…`) → `createSendFn` menamespace lagi saat dikirim balik → `deliver`
   * gagal (approval HITL `inputResponses` TAK punya fallback → "Cannot deliver"). Token klien
   * = nilai yang dipakai live (ter-namespace sekali) → cocok sesudah reload.
   */
  async saveContinuation(
    db: DbOrTx,
    input: { ownerUserId: string; threadId: string; continuationToken: string },
  ): Promise<{ ok: true }> {
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    await ChatThreadRepo.update(db, input.threadId, {
      continuationToken: input.continuationToken,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /** Hapus thread + cascade pesan (FK no-action → pesan dihapus dulu, satu tx). */
  async remove(db: Db, input: { ownerUserId: string; threadId: string }): Promise<{ ok: true }> {
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    await db.transaction(async (tx) => {
      await ChatMessageRepo.deleteByThread(tx, input.threadId);
      await ChatThreadRepo.deleteById(tx, input.threadId);
    });
    return { ok: true };
  },
};

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(limit)));
}
