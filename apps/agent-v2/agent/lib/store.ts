import {
  assistantMessageId,
  messagePreview,
  ownershipVerdict,
  userMessageId,
} from "@aqsha/chat-core";
import { getSql } from "./db.ts";

/**
 * Store proyeksi chat untuk PROSES eve (Slice 6.1) — tulisan raw SQL via postgres.js.
 *
 * KENAPA raw SQL (bukan `@aqsha/services`/`@aqsha/db`): bundle eve tak bisa mengonsumsi
 * paket workspace TS-mentah (lihat `./db.ts`). Struktur tabel SSOT = `packages/db`
 * (migrasi 0007 `chat_threads`/`chat_messages`); modul ini HANYA mereferensikan nama
 * kolom. Path tulisan ini terpisah dari path BACA route api-v2 (`@aqsha/services` →
 * `ThreadService`/`MessageService`) — tak ada operasi yang tumpang-tindih.
 *
 * Idempoten: `on conflict do nothing/update` (step durable re-run saat resume tak duplikat).
 */

type ThreadStatus = "idle" | "streaming" | "failed";

/** Create thread terikat eve session (id == sessionId) + owner. Idempotent. */
export async function ensureThread(input: {
  sessionId: string;
  ownerUserId: string;
  agentKind?: "lite" | "pro";
}): Promise<void> {
  const sql = getSql();
  const now = Date.now();
  await sql`
    insert into chat_threads
      (id, owner_user_id, status, agent_kind, last_activity_at, created_at, updated_at)
    values
      (${input.sessionId}, ${input.ownerUserId}, 'streaming', ${input.agentKind ?? "lite"},
       ${now}, ${now}, ${now})
    on conflict (id) do nothing
  `;
}

/** Set status thread (proyeksi turn lifecycle). No-op bila thread belum ada. */
export async function setThreadStatus(sessionId: string, status: ThreadStatus): Promise<void> {
  const sql = getSql();
  await sql`update chat_threads set status = ${status}, updated_at = ${Date.now()} where id = ${sessionId}`;
}

/**
 * Append satu event stream eve ke `chat_thread_events` (resume streaming lintas-refresh).
 *
 * Persist **1:1** dengan stream eve (baseline template `chat_event`): SETIAP event, termasuk
 * delta `*.appended` + lifecycle `session.*`. Konsekuensinya log = prefix setia stream eve →
 * klien resume turn aktif via `ClientSession.stream({ startIndex: max(event_index)+1 })` dan
 * me-render token-demi-token (visual reload == live).
 *
 * `event_index` = `max(event_index)+1` per-thread, dihitung di statement insert. Hook eve
 * fire per event BERURUTAN + di-await per session (jaminan eve) → tiap insert commit sebelum
 * yang berikut → `max` selalu mutakhir, tanpa race + tanpa state in-memory (bebas leak/seed).
 * `on conflict (thread_id, event_index) do update` = jaga idempoten (defensif). JANGAN pakai
 * `event.data.sequence` (ORDINAL TURN, sama untuk semua event satu turn).
 *
 * Beban: insert per-token (delta) ~1ms (Postgres se-VPS) << interval kedatangan token model →
 * await per event tak mem-backpressure stream. Thread dijamin ada (handler `session.started`
 * → `ensureThread` jalan SEBELUM `"*"` untuk event yang sama); kegagalan tetap di-`swallow`.
 */
export async function appendThreadEvent(input: {
  sessionId: string;
  ownerUserId: string;
  event: { type: string; data?: unknown };
}): Promise<void> {
  const type = input.event.type;
  const data = (input.event.data ?? {}) as { turnId?: unknown };
  const turnId = typeof data.turnId === "string" ? data.turnId : null;
  const sql = getSql();
  await sql`
    insert into chat_thread_events
      (thread_id, owner_user_id, event_index, type, turn_id, payload, created_at)
    values
      (
        ${input.sessionId}, ${input.ownerUserId},
        (select coalesce(max(event_index), -1) + 1 from chat_thread_events where thread_id = ${input.sessionId}),
        ${type}, ${turnId}, ${sql.json(input.event as never)}, ${Date.now()}
      )
    on conflict (thread_id, event_index) do update
      set payload = excluded.payload, type = excluded.type, turn_id = excluded.turn_id
  `;
}

/** Upsert pesan user + bump aktivitas thread (satu transaksi). */
export async function recordUserMessage(input: {
  sessionId: string;
  ownerUserId: string;
  turnId: string;
  text: string;
}): Promise<void> {
  await persistMessage({
    id: userMessageId(input.sessionId, input.turnId),
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    turnId: input.turnId,
    role: "user",
    text: input.text,
    reasoning: null,
    status: "complete",
  });
}

/** Upsert pesan assistant + bump aktivitas thread (satu transaksi). */
export async function recordAssistantMessage(input: {
  sessionId: string;
  ownerUserId: string;
  turnId: string;
  sequence: number;
  text: string;
  reasoning?: string | null;
}): Promise<void> {
  await persistMessage({
    id: assistantMessageId(input.sessionId, input.turnId, input.sequence),
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    turnId: input.turnId,
    role: "assistant",
    text: input.text,
    reasoning: input.reasoning ?? null,
    status: "complete",
  });
}

/** Verdikt ownership session→thread untuk `onMessage` (follow-up). */
export async function checkOwnership(
  sessionId: string,
  callerPrincipalId: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const sql = getSql();
  const rows = await sql<{ owner_user_id: string }[]>`
    select owner_user_id from chat_threads where id = ${sessionId} limit 1
  `;
  const thread = rows[0] ? { ownerUserId: rows[0].owner_user_id } : null;
  return ownershipVerdict(thread, callerPrincipalId);
}

async function persistMessage(row: {
  id: string;
  sessionId: string;
  ownerUserId: string;
  turnId: string;
  role: "user" | "assistant";
  text: string;
  reasoning: string | null;
  status: "complete";
}): Promise<void> {
  const sql = getSql();
  const now = Date.now();
  const preview = messagePreview(row.text);
  await sql.begin(async (tx) => {
    // Defensif: pastikan thread ada SEBELUM insert pesan (FK `chat_messages.thread_id`).
    // Normalnya `session.started` sudah create thread (event terurut), tapi ini bikin
    // proyeksi self-healing — pesan tak hilang walau urutan event berubah.
    await tx`
      insert into chat_threads
        (id, owner_user_id, status, agent_kind, last_activity_at, created_at, updated_at)
      values
        (${row.sessionId}, ${row.ownerUserId}, 'streaming', 'lite', ${now}, ${now}, ${now})
      on conflict (id) do nothing
    `;
    await tx`
      insert into chat_messages
        (id, thread_id, owner_user_id, role, text, reasoning, status, turn_id, created_at)
      values
        (${row.id}, ${row.sessionId}, ${row.ownerUserId}, ${row.role}, ${row.text},
         ${row.reasoning}, ${row.status}, ${row.turnId}, ${now})
      on conflict (id) do update
        set text = excluded.text, reasoning = excluded.reasoning, status = excluded.status
    `;
    await tx`
      update chat_threads
        set last_activity_at = ${now}, updated_at = ${now}, last_message_preview = ${preview}
        where id = ${row.sessionId}
    `;
  });
}
