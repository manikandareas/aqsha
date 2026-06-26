import { BillingService } from "@aqsha/services/billing";
import { TitleService } from "@aqsha/services/chat";
import { defineHook, type HookContext } from "eve/hooks";
import { getServiceDb } from "../lib/db.ts";
import {
  appendThreadEvent,
  ensureThread,
  recordAssistantMessage,
  recordUserMessage,
  setThreadStatus,
  stripSupersededDeltas,
} from "../lib/store.ts";

/**
 * Hook proyeksi (Slice 6.1) — OBSERVE-ONLY. eve menjalankan handler SETELAH event
 * direkam durable (hook tak bisa deny tool; itu `needsApproval`). Handler memproyeksi
 * stream eve → Postgres (`chat_threads` + `chat_messages`) supaya history persist &
 * bisa di-reload.
 *
 * INVARIAN:
 * - Thread di-CREATE di sini (`session.started`), BUKAN di api — `id == ctx.session.id`
 *   (eve session id). onMessage tak punya sessionId untuk turn baru, jadi create lazy lewat
 *   hook adalah satu-satunya titik.
 * - Step durable yang ter-interrupt RE-RUN saat resume → semua tulisan IDEMPOTEN
 *   (`on conflict` di `agent/lib/store.ts`).
 * - Handler WAJIB try/catch: hook yang melempar → `turn.failed`/`session.failed`. Kegagalan
 *   DB tak boleh meracuni turn.
 * - usage/billing: `step.completed` → `consumeCredits` (Slice 6.2). Debit per model-call,
 *   IDEMPOTEN via `idempotencyKey = sessionId:turnId:stepIndex` (step ter-interrupt RE-RUN
 *   saat resume tak double-debit, A9). Di-`swallow` — kegagalan billing tak boleh meracuni turn.
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
    // Capture timeline (fix persist) — append SETIAP event stream ke `chat_thread_events`
    // 1:1 (TANPA filter: termasuk delta `*.appended` + lifecycle `session.*`), supaya replay
    // == stream live. `"*"` jalan SETELAH handler bertipe (doc hooks: typed dulu, lalu `*`),
    // jadi `session.started` → `ensureThread` sudah commit → thread dijamin ada (FK aman).
    async "*"(event, ctx) {
      const ownerUserId = owner(ctx);
      if (!ownerUserId) return;
      await swallow("event", () =>
        appendThreadEvent({ sessionId: ctx.session.id, ownerUserId, event }),
      );
    },

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

    async "step.completed"(event, ctx) {
      const ownerUserId = owner(ctx);
      if (!ownerUserId) return;
      const inputTokens = event.data.usage?.inputTokens ?? 0;
      const outputTokens = event.data.usage?.outputTokens ?? 0;
      await swallow("step.completed", async () => {
        await BillingService.consumeCredits(getServiceDb(), {
          ownerUserId,
          feature: "normal_chat", // D-B: P6 Lite. (Pro → pro_chat saat agent Pro landing.)
          provider: "openai", // agent pakai @ai-sdk/openai (lihat agent/agent.ts).
          agentKind: AGENT_KIND,
          threadId: ctx.session.id,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          // A9 idempotency: sessionId:turnId:stepIndex unik per model-call durable.
          idempotencyKey: `${ctx.session.id}:${event.data.turnId}:${event.data.stepIndex}`,
        });
      });
      // B-strip (Phase 6): step selesai → kosongkan payload delta tersusul step ini (at-rest KB).
      // Swallow TERPISAH dari billing — gagal-strip tak boleh ganggu debit (dan sebaliknya).
      await swallow("strip", () =>
        stripSupersededDeltas({
          sessionId: ctx.session.id,
          turnId: event.data.turnId,
          stepIndex: event.data.stepIndex,
        }),
      );
    },

    async "turn.completed"(_event, ctx) {
      await swallow("turn.completed", () => setThreadStatus(ctx.session.id, "idle"));
      // Auto-title (Slice 6.8): klaim atomik (turn-pertama + rename-guard) → enqueue worker.
      // No-op untuk turn ke-2+ / thread sudah di-rename. Swallow: kegagalan tak racuni turn.
      await swallow("title", async () => {
        await TitleService.requestTitle(getServiceDb(), ctx.session.id);
      });
    },

    async "turn.failed"(_event, ctx) {
      await swallow("turn.failed", () => setThreadStatus(ctx.session.id, "failed"));
    },

    async "session.completed"(_event, ctx) {
      await swallow("session.completed", () => setThreadStatus(ctx.session.id, "idle"));
    },
  },
});
