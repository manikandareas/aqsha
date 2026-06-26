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
   */
  async listByThread(
    db: DbOrTx,
    threadId: string,
    afterIndex?: number,
  ): Promise<ChatThreadEvent[]> {
    const filters = [eq(chatThreadEvents.threadId, threadId)];
    if (afterIndex !== undefined) filters.push(gt(chatThreadEvents.eventIndex, afterIndex));
    // Semua event NON-delta + hanya delta TERAKHIR per (type, turn_id, stepIndex).
    filters.push(sql`(
      ${chatThreadEvents.type} not in ('message.appended', 'reasoning.appended')
      or ${chatThreadEvents.eventIndex} in (
        select max(event_index)
        from chat_thread_events
        where thread_id = ${threadId}
          and type in ('message.appended', 'reasoning.appended')
        group by type, turn_id, (payload -> 'data' ->> 'stepIndex')
      )
    )`);
    return db
      .select()
      .from(chatThreadEvents)
      .where(and(...filters))
      .orderBy(asc(chatThreadEvents.eventIndex));
  },
};
