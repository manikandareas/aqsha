import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { chatThreads } from "./chatThreads";
import { users } from "./users";

/**
 * chat_thread_events — log event stream eve mentah per thread (fix timeline persist).
 *
 * KENAPA: `chat_messages` hanya menyimpan teks + reasoning final, jadi saat reload UI
 * kehilangan SELURUH timeline aktivitas (tool call, load-skill, subagent, HITL, hasil)
 * yang hanya hidup di buffer in-memory eve selama tab streaming. Menyimpan event mentah
 * lalu me-replay-nya lewat `defaultMessageReducer` (reducer eve yang sama dengan live)
 * membuat timeline reload == live SECARA KONSTRUKSI, dan memungkinkan progress in-flight
 * tetap terlihat setelah refresh (klien poll tabel ini selagi turn berjalan).
 *
 * - Persist **1:1** dengan stream eve (baseline template `chat_event`): SETIAP event,
 *   termasuk delta `*.appended` + lifecycle `session.*`. Karena `event_index` kontigu dari 0
 *   (lihat di bawah), cursor resume klien = `max(event_index)+1` (== `events.length`) yang
 *   dipetakan ke `startIndex` stream eve ("reconnect by event count"). Klien hand-roll fetch
 *   `/eve/v1/session/:id/stream?startIndex=N` (`use-thread-resume.ts`) — BUKAN `ClientSession
 *   .stream` (runtime eve tak bisa di-bundle ke browser).
 * - `event_index` = posisi monoton per-thread (0,1,2,…) = posisi stream eve. `UNIQUE
 *   (thread_id, event_index)` + upsert (`appendThreadEvent`) → idempoten saat durable re-run
 *   (re-emit event step yang sama tak menggandakan baris). Replay urut `asc(event_index)`.
 *   JANGAN pakai `event.data.sequence` sebagai kunci: itu ORDINAL TURN (sama untuk semua
 *   event satu turn).
 * - `id` bigserial dipertahankan sebagai ordering sisip stabil (tie-break) + PK.
 * - `payload` = `HandleMessageStreamEvent` utuh (jsonb), diumpankan apa adanya ke reducer.
 *   Di-`unknown` agar `@aqsha/db` tak bergantung pada tipe eve.
 * - Path TULIS = PROSES eve (`apps/agent-v2/agent/lib/store.ts`, raw SQL). Path BACA =
 *   route api-v2 via `@aqsha/services` (`EventService`).
 */
export const chatThreadEvents = pgTable(
  "chat_thread_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    eventIndex: integer("event_index").notNull(),
    type: text("type").notNull(),
    turnId: text("turn_id"),
    // `payload.data.stepIndex` di-lift ke kolom (Phase 3): compaction jalur-baca (`listByThread`)
    // GROUP BY kolom ini, bukan ekspresi JSON `payload->'data'->>'stepIndex'` yang men-DETOAST
    // SELURUH payload (32MB) tiap panggil hanya untuk membaca satu int → cold-load ~2 dtk. Nullable
    // (event non-step / event lama pra-backfill).
    stepIndex: integer("step_index"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // UNIQUE (thread_id, event_index) sekaligus melayani lookup + ordering replay per thread.
    uniqueIndex("chat_thread_events_thread_event_index").on(t.threadId, t.eventIndex),
    // Mendukung GROUP BY compaction delta (`listByThread`) tanpa detoast payload (Phase 3).
    index("chat_thread_events_thread_type_step").on(t.threadId, t.type, t.stepIndex),
  ],
);

export type ChatThreadEvent = typeof chatThreadEvents.$inferSelect;
export type NewChatThreadEvent = typeof chatThreadEvents.$inferInsert;
