import { messagePreview, stripMentionMarkers } from "@aqsha/chat-core";
import { ThreadService, TitleService } from "@aqsha/services/chat";
import type { ProcessInputArgs, ProcessOutputResultArgs } from "@mastra/core/processors";
import { getServiceDb } from "../lib/db";
import { resolveOwnerThread } from "../lib/owner-thread";
import type { AgentKind } from "../lib/tool-context";

/**
 * Proyeksi thread (Fase 3 cutover) — menggantikan hook `projection.ts` eve untuk jalur Mastra.
 *
 * Mastra Memory = SoT pesan (auto-save `mastra_messages`), tapi sidebar + billing list app
 * membaca `chat_threads`. Mastra TAK punya projection hook, jadi outputProcessor ini meng-upsert
 * baris `chat_threads` TIPIS (owner/status/preview/agent_kind) per turn dan men-trigger title-gen
 * async (`TitleService.requestTitle` → worker BullMQ). TIDAK menulis `chat_messages`/
 * `chat_thread_events` (di-deprecate; Memory yang menyimpan isi pesan).
 *
 * Owner + threadId via `resolveOwnerThread` (pesan tersimpan dulu, fallback RequestContext).
 * Best-effort: kegagalan proyeksi tak boleh meracuni turn.
 */

/**
 * Teks pesan user PERTAMA (seed judul thread). `content.content` string atau gabung part `text`.
 * Penanda `@mention` (U+E000/E001) di-strip supaya tak bocor ke judul yang dihasilkan LLM.
 */
function firstUserText(messages: ProcessOutputResultArgs["messages"]): string | null {
  const user = messages.find((m) => m.role === "user");
  if (!user) return null;
  const content = user.content as { content?: unknown; parts?: Array<{ type?: string; text?: unknown }> };
  const raw =
    typeof content?.content === "string" && content.content.trim()
      ? content.content
      : (content?.parts ?? [])
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string)
          .join("\n")
          .trim();
  return raw ? stripMentionMarkers(raw) : null;
}

/**
 * Proyeksi thread per-tier. Tiap agent (`astra-lite`/`astra-pro`) memasang sepasang processor sendiri
 * lewat `makeThreadProjectionProcessors(tier)` → kolom `chat_threads.agent_kind` mencerminkan tier
 * yang benar-benar menjalankan turn (sidebar + billing list app membacanya).
 */
export function makeThreadProjectionProcessors(tier: AgentKind) {
  /**
   * Proyeksi DINI (turn-start) — upsert `chat_threads` TIPIS sebelum agentic loop supaya thread BARU
   * durable sejak token pertama: refresh saat turn-pertama streaming tak lagi "Akses ditolak"
   * (`chat_threads` baru terisi di onFinish via `processOutputResult` → ada jendela kosong). Tanpa
   * preview/title (itu di output). Idempoten + best-effort.
   */
  const input = {
    id: `thread-projection-input-${tier}`,
    async processInput({ requestContext, messages }: ProcessInputArgs) {
      const { ownerUserId, threadId } = resolveOwnerThread(requestContext, messages);
      if (ownerUserId && threadId) {
        try {
          await ThreadService.ensureProjected(getServiceDb(), {
            threadId,
            ownerUserId,
            agentKind: tier,
            preview: null,
          });
        } catch (err) {
          console.error("[thread-projection-input] failed", err);
        }
      }
      return messages;
    },
  };

  const output = {
    id: `thread-projection-${tier}`,
    async processOutputResult({
      requestContext,
      result,
      messages,
      messageList,
    }: ProcessOutputResultArgs) {
      const { ownerUserId, threadId } = resolveOwnerThread(requestContext, messages);
      if (ownerUserId && threadId) {
        const preview = result.text ? messagePreview(result.text) : null;
        try {
          const db = getServiceDb();
          await ThreadService.ensureProjected(db, {
            threadId,
            ownerUserId,
            agentKind: tier,
            preview,
          });
          // Title async (GAP-c): klaim atomik turn-pertama + enqueue worker (membawa seed pesan
          // user pertama — Mastra Memory = SoT pesan); no-op turn ke-2+.
          await TitleService.requestTitle(db, threadId, firstUserText(messages));
        } catch (err) {
          console.error("[thread-projection] failed", err);
        }
      }
      return messageList;
    },
  };

  return { input, output };
}
