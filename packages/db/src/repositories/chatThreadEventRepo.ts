import { and, asc, eq, gt, sql } from "drizzle-orm";
import { type ChatThreadEvent, chatThreadEvents } from "../schema/chatThreadEvents";
import type { DbOrTx } from "../types";

/** Repo chat_thread_events — BACA saja (tulis via raw SQL di PROSES eve). */
export const ChatThreadEventRepo = {
  /**
   * Event stream thread, urut `event_index` ASC (= posisi stream eve; cursor resume klien).
   * `afterIndex` (opsional) = fetch INCREMENTAL hanya delta `event_index > afterIndex`.
   *
   * COMPACTION (krusial untuk performa): `message.appended`/`reasoning.appended` membawa
   * `messageSoFar`/`reasoningSoFar` KUMULATIF, jadi log mentah O(n²) byte (terukur 18MB untuk
   * satu `/deep`) → menarik dari Postgres VPS lambat berdetik-detik tiap cold-load. Reducer eve
   * me-REPLACE part teks tiap delta, jadi HANYA delta terakhir per (type, turn, step) yang
   * menentukan hasil. Query ini membuang delta yang sudah disusul → payload kecil, cursor tetap
   * benar (delta tail per langkah ikut → `max(event_index)` ≈ posisi stream eve sebenarnya).
   * Token-level realtime tetap via resume stream eve (`/eve/v1/.../stream`).
   *
   * GROUP BY kolom `step_index` (Phase 3, fix C), BUKAN ekspresi `payload->'data'->>'stepIndex'`
   * yang memaksa DETOAST seluruh payload (32MB) tiap panggil hanya untuk membaca satu int →
   * cold-load ~2 dtk. Kolom + index `(thread_id, type, step_index)` → grouping tanpa detoast;
   * payload hanya di-detoast untuk ~84 baris final yang benar-benar di-SELECT.
   */
  async listByThread(
    db: DbOrTx,
    threadId: string,
    afterIndex?: number,
  ): Promise<ChatThreadEvent[]> {
    const filters = [eq(chatThreadEvents.threadId, threadId)];
    if (afterIndex !== undefined) filters.push(gt(chatThreadEvents.eventIndex, afterIndex));
    // Semua event NON-delta + hanya delta TERAKHIR per (type, turn_id, step_index).
    filters.push(sql`(
      ${chatThreadEvents.type} not in ('message.appended', 'reasoning.appended')
      or ${chatThreadEvents.eventIndex} in (
        select max(event_index)
        from chat_thread_events
        where thread_id = ${threadId}
          and type in ('message.appended', 'reasoning.appended')
        group by type, turn_id, step_index
      )
    )`);
    return db
      .select()
      .from(chatThreadEvents)
      .where(and(...filters))
      .orderBy(asc(chatThreadEvents.eventIndex));
  },

  /**
   * Append event terminal SINTETIK (reconciler zombie, Phase 5, fix E). Turn yang crash mid-stream
   * tak menulis event terminal → event terakhir non-terminal → klien `isStreamActive(base)` true
   * selamanya (composer terkunci). Sisipkan `turn.failed` (∈ `SETTLED_OR_PARKED_LAST` klien) di
   * `event_index = max+1` → `isStreamActive` false → composer unlock saat reload. `event_index` via
   * subquery (sama pola `store.ts`); `onConflictDoNothing` defensif (idempoten bila dijalankan ulang).
   * Payload = event eve minimal valid; reducer memperlakukan `turn.failed` sbg no-op (gate UI via
   * status='failed' + isStreamActive), jadi turnId tak wajib.
   */
  async appendTerminal(
    db: DbOrTx,
    input: { threadId: string; ownerUserId: string; type: string },
  ): Promise<void> {
    const now = Date.now();
    await db
      .insert(chatThreadEvents)
      .values({
        threadId: input.threadId,
        ownerUserId: input.ownerUserId,
        eventIndex: sql`(select coalesce(max(event_index), -1) + 1 from chat_thread_events where thread_id = ${input.threadId})`,
        type: input.type,
        turnId: null,
        stepIndex: null,
        payload: { type: input.type, data: { reason: "reconciled_stale" } },
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [chatThreadEvents.threadId, chatThreadEvents.eventIndex],
      });
  },
};
