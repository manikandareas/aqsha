import { defineHook, type HookContext } from "eve/hooks";
import {
  ensureThread,
  recordAssistantMessage,
  recordUserMessage,
  setThreadStatus,
} from "../lib/store";

/**
 * Hook proyeksi (Slice 6.1) — OBSERVE-ONLY. eve menjalankan handler SETELAH event
 * direkam durable (hook tak bisa deny tool; itu `needsApproval`). Handler memproyeksi
 * stream eve → Postgres (`chat_threads` + `chat_messages`) supaya history persist &
 * bisa di-reload.
 *
 * INVARIAN:
 * - Thread di-CREATE di sini (`session.started`), BUKAN di api-v2 — `id == ctx.session.id`
 *   (eve session id). onMessage tak punya sessionId untuk turn baru, jadi create lazy lewat
 *   hook adalah satu-satunya titik.
 * - Step durable yang ter-interrupt RE-RUN saat resume → semua tulisan IDEMPOTEN
 *   (`on conflict` di `agent/lib/store.ts`).
 * - Handler WAJIB try/catch: hook yang melempar → `turn.failed`/`session.failed`. Kegagalan
 *   DB tak boleh meracuni turn.
 * - usage/billing (`step.completed`) = Slice 6.2 (belum di sini).
 */

const AGENT_KIND = "lite" as const; // D-B: P6 ship satu agent (Lite).

/** Owner = pembuat session (initiator); fallback ke caller turn terakhir. */
function owner(ctx: HookContext): string | null {
  return ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId ?? null;
}

async function swallow(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[projection] ${label} failed`, err);
  }
}

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const ownerUserId = owner(ctx);
      if (!ownerUserId) return;
      await swallow("session.started", () =>
        ensureThread({ sessionId: ctx.session.id, ownerUserId, agentKind: AGENT_KIND }),
      );
    },

    async "turn.started"(_event, ctx) {
      await swallow("turn.started", () => setThreadStatus(ctx.session.id, "streaming"));
    },

    async "message.received"(event, ctx) {
      const ownerUserId = owner(ctx);
      if (!ownerUserId) return;
      await swallow("message.received", () =>
        recordUserMessage({
          sessionId: ctx.session.id,
          ownerUserId,
          turnId: event.data.turnId,
          text: event.data.message,
        }),
      );
    },

    async "message.completed"(event, ctx) {
      // `message === null` ⇒ step tanpa teks tampak (mis. tool-call). Skip juga string
      // kosong/whitespace supaya tak menyimpan bubble assistant hampa di history.
      const text = event.data.message;
      if (text == null || text.trim() === "") return;
      const ownerUserId = owner(ctx);
      if (!ownerUserId) return;
      await swallow("message.completed", () =>
        recordAssistantMessage({
          sessionId: ctx.session.id,
          ownerUserId,
          turnId: event.data.turnId,
          // `sequence` (bukan stepIndex): satu turn bisa >1 message.completed ber-stepIndex
          // sama (teks→tool→teks); sequence distinct → tak saling timpa.
          sequence: event.data.sequence,
          text,
        }),
      );
    },

    async "turn.completed"(_event, ctx) {
      await swallow("turn.completed", () => setThreadStatus(ctx.session.id, "idle"));
    },

    async "turn.failed"(_event, ctx) {
      await swallow("turn.failed", () => setThreadStatus(ctx.session.id, "failed"));
    },

    async "session.completed"(_event, ctx) {
      await swallow("session.completed", () => setThreadStatus(ctx.session.id, "idle"));
    },
  },
});
