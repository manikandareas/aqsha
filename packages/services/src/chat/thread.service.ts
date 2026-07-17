import {
  type ChatThread,
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
const PIN_CAP = 10; // soft-cap thread yang bisa disematkan sekaligus (grup "Disematkan" sidebar)

// Guard log satu-kali: proyeksi yang datang tanpa scope proyek (klien tak kirim RequestContext).
let warnedMissingWorkspaceScope = false;

/** Bucket aktivitas thread untuk pengelompokan sidebar — dihitung server-side (BE). */
export type ThreadBucket = "recent" | "older";
export type ThreadListItem = ChatThread & { bucket: ThreadBucket };

/**
 * ThreadService — path BACA + CRUD non-stream thread Astra, dipakai route api.
 * Path TULIS proyeksi = `ensureProjected` di bawah, dipanggil outputProcessor
 * runtime agent (konsumsi via dist build) — tak ada operasi yang tumpang-tindih.
 */
export const ThreadService = {
  /** Soft ownership: `null` bila missing/not-owned (BUKAN throw). Path route GET /:id. */
  async get(db: DbOrTx, ownerUserId: string, threadId: string): Promise<ChatThread | null> {
    const thread = await ChatThreadRepo.findById(db, threadId);
    if (!thread || thread.ownerUserId !== ownerUserId) return null;
    return thread;
  },

  /**
   * Proyeksi thread Mastra → `chat_threads` (Fase 3 cutover). Mastra Memory = SoT pesan, jadi
   * ini HANYA menyiapkan baris metadata tipis (owner/status/preview/agent_kind) yang dibutuhkan
   * sidebar + billing list — TIDAK menulis `chat_messages`/`chat_thread_events`.
   * Idempoten: insert-if-absent → update aktivitas/preview/status. Dipanggil outputProcessor
   * agent per turn; `status='idle'` (turn selesai saat output result).
   */
  async ensureProjected(
    db: DbOrTx,
    input: {
      threadId: string;
      ownerUserId: string;
      agentKind?: "lite" | "pro";
      preview?: string | null;
      workspaceId?: string | null;
    },
  ): Promise<void> {
    const now = Date.now();
    // `workspace_id` NOT NULL → tak bisa membuat baris baru tanpa scope proyek. Bila klien
    // tak mengirim RequestContext, lewati INSERT (best-effort — jangan throw / racuni turn)
    // dan cukup UPDATE bila baris sudah ada dari turn ber-scope sebelumnya.
    let inserted = false;
    if (input.workspaceId) {
      inserted = await ChatThreadRepo.insertIfAbsent(db, {
        id: input.threadId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        status: "idle",
        agentKind: input.agentKind ?? "lite",
        lastMessagePreview: input.preview ?? null,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else if (!warnedMissingWorkspaceScope) {
      // Klien tanpa scope memanggil ini tiap turn — log SEKALI per proses agar tak membanjiri.
      warnedMissingWorkspaceScope = true;
      console.error(
        "[ThreadService.ensureProjected] lewati INSERT: scope proyek kosong (RequestContext aqsha-workspace-id tak dikirim)",
      );
    }
    if (!inserted) {
      await ChatThreadRepo.update(db, input.threadId, {
        status: "idle",
        lastActivityAt: now,
        updatedAt: now,
        ...(input.preview ? { lastMessagePreview: input.preview } : {}),
        // Scope proyek menyusul (mis. baris dini tanpa context) — jangan clobber ke null.
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      });
    }
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

  /**
   * Assert kepemilikan TOLERAN-absen (D6, lampiran pesan pertama). `chat_threads` baru terbentuk
   * saat pesan pertama (proyeksi outputProcessor agent), tapi user bisa melampirkan file SEBELUM
   * itu di percakapan baru. `artifacts.thread_id` tak ber-FK → artifact boleh menunjuk thread yang
   * proyeksinya menyusul. Aman: thread yang SUDAH ada tapi BUKAN milik caller → 404 (cegah numpang
   * thread orang lain); absen → lolos (caller akan jadi pemilik saat pesan pertama).
   */
  async assertOwnerOrAbsent(db: DbOrTx, ownerUserId: string, threadId: string): Promise<void> {
    const thread = await ChatThreadRepo.findById(db, threadId);
    if (thread && thread.ownerUserId !== ownerUserId) {
      throwAppError({
        message: "Percakapan tidak ditemukan",
        code: "thread_not_found",
        severity: "error",
        status: 404,
      });
    }
  },

  /** List keyset milik owner (opsional per proyek), DESC aktivitas. Bucket recent/older di BE. */
  async list(
    db: DbOrTx,
    ownerUserId: string,
    args: { cursor?: string | null; limit?: number; workspaceId?: string },
  ): Promise<{ items: ThreadListItem[]; nextCursor: string | null }> {
    const { items, nextCursor } = await ChatThreadRepo.listByOwner(db, {
      ownerUserId,
      workspaceId: args.workspaceId,
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

  /** Thread yang disematkan milik owner, DESC `pinnedAt` (pin terbaru dulu) — grup "Disematkan". */
  async listPinned(db: DbOrTx, ownerUserId: string): Promise<ChatThread[]> {
    return ChatThreadRepo.listPinnedByOwner(db, { ownerUserId, limit: PIN_CAP });
  },

  /**
   * Sematkan / lepas sematan thread. `pinnedAt = now` (pin) atau `null` (lepas); idempoten.
   * Soft-cap {@link PIN_CAP}: hanya dicek saat transisi unpinned→pinned (thread yang sudah
   * dipin lolos). Melebihi cap → `appError` severity `warning` (FE surface via toast).
   * Proyeksi `ensureProjected` per turn tak menyentuh `pinnedAt` → pin persist lintas pesan.
   */
  async setPinned(
    db: DbOrTx,
    input: { ownerUserId: string; threadId: string; pinned: boolean },
  ): Promise<{ ok: true; pinnedAt: number | null }> {
    const thread = await this.assertOwner(db, input.ownerUserId, input.threadId);

    if (!input.pinned) {
      if (thread.pinnedAt === null) return { ok: true, pinnedAt: null };
      await ChatThreadRepo.update(db, input.threadId, { pinnedAt: null, updatedAt: Date.now() });
      return { ok: true, pinnedAt: null };
    }

    if (thread.pinnedAt !== null) return { ok: true, pinnedAt: thread.pinnedAt };
    const pinnedCount = await ChatThreadRepo.countPinnedByOwner(db, input.ownerUserId);
    if (pinnedCount >= PIN_CAP) {
      throwAppError({
        message: `Maksimal ${PIN_CAP} thread yang dapat disematkan. Lepas salah satu dulu.`,
        code: "pin_limit_reached",
        severity: "warning",
      });
    }
    const now = Date.now();
    await ChatThreadRepo.update(db, input.threadId, { pinnedAt: now, updatedAt: now });
    return { ok: true, pinnedAt: now };
  },

  /**
   * Hapus thread, satu tx. FK `research_sources` ber-`onDelete` no-action → wajib dihapus dulu
   * (kalau tidak, thread hasil `/deep` yang punya sumber → FK violation). Isi pesan Mastra
   * (`mastra_messages`/`mastra_threads`) berada di storage Mastra terpisah — tak di-cascade dari
   * sini (cleanup memory thread = follow-up bila perlu).
   */
  async remove(db: Db, input: { ownerUserId: string; threadId: string }): Promise<{ ok: true }> {
    await this.assertOwner(db, input.ownerUserId, input.threadId);
    await db.transaction(async (tx) => {
      await ResearchSourceRepo.deleteByThread(tx, input.threadId);
      await ChatThreadRepo.deleteById(tx, input.threadId);
    });
    return { ok: true };
  },
};

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(limit)));
}
