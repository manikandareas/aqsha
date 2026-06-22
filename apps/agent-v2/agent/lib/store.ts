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
 * Persist resume handle eve (continuationToken) saat sesi parkir (`session.waiting`).
 * Dibutuhkan agar follow-up di thread yang di-reload bisa lanjut — eve menolak continue
 * tanpa continuationToken. No-op bila thread belum ada.
 */
export async function saveContinuationToken(sessionId: string, token: string): Promise<void> {
  const sql = getSql();
  await sql`update chat_threads set continuation_token = ${token}, updated_at = ${Date.now()} where id = ${sessionId}`;
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
