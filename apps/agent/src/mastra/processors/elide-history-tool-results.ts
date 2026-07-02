import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type { ProcessInputStepArgs, Processor } from "@mastra/core/processors";

/**
 * Elide payload hasil tool pada pesan RIWAYAT (CTX-6).
 *
 * Masalah: jendela history (`lastMessages` 16/32) memutar ulang FULL JSON hasil tool tiap giliran —
 * pesan asisten riset membawa seluruh hasil `search_*` (ribuan token basi per pesan) yang mengubur
 * percakapan; `TokenLimiter` baru bertindak di ~96k, jauh setelah kualitas konteks rusak.
 *
 * Solusi: pada tiap step, hasil tool BESAR di pesan yang bersumber `memory` (riwayat/recall —
 * dibedakan via `messageList.get.remembered.db()`) diganti stub ringkas `{elided, toolName, note}`.
 * Pesan turn AKTIF tak pernah disentuh (model masih butuh hasilnya untuk menulis jawaban), begitu
 * pula `keepLastAssistant` pesan asisten riwayat terbaru (follow-up "ringkas hasil tadi" tetap
 * punya data giliran terakhir).
 *
 * Aman: pesan bersumber `memory` TIDAK ikut `drainUnsavedMessages` → baris DB tetap utuh (kartu
 * tool FE tak berubah); fungsi idempoten (stub dikenali via `elided: true`); urutan pesan
 * dipertahankan (runner meng-apply ulang seluruh array yang dikembalikan).
 */

/** Payload hasil tool riwayat ≥ ambang ini (chars JSON) di-elide. */
const ELIDE_MIN_CHARS = 1_500;
/** Jumlah pesan asisten riwayat TERBARU yang hasil tool-nya dibiarkan utuh. */
const KEEP_LAST_ASSISTANT = 1;

type ElidedStub = { elided: true; toolName: string; note: string };

function isElidedStub(value: unknown): value is ElidedStub {
  return typeof value === "object" && value !== null && (value as { elided?: unknown }).elided === true;
}

function elideStub(toolName: string, chars: number): ElidedStub {
  return {
    elided: true,
    toolName,
    note:
      `Hasil tool \`${toolName}\` dari giliran sebelumnya disembunyikan untuk menghemat konteks (~${chars} karakter). ` +
      "Jawaban asisten pada giliran itu sudah merangkum hasilnya; panggil ulang tool bila datanya dibutuhkan lagi.",
  };
}

/** Elide result satu invocation bila besar; return true bila ada perubahan. */
function maybeElide(inv: { state?: string; toolName?: string; result?: unknown }): boolean {
  if (inv.state !== "result" || inv.result === undefined || isElidedStub(inv.result)) return false;
  let chars: number;
  try {
    chars = JSON.stringify(inv.result)?.length ?? 0;
  } catch {
    return false;
  }
  if (chars < ELIDE_MIN_CHARS) return false;
  inv.result = elideStub(inv.toolName ?? "unknown", chars);
  return true;
}

export class ElideHistoryToolResultsProcessor implements Processor {
  readonly id = "elide-history-tool-results";

  processInputStep({ messages, messageList }: ProcessInputStepArgs): MastraDBMessage[] {
    const rememberedIds = new Set(messageList.get.remembered.db().map((m) => m.id));
    // Pesan asisten riwayat terbaru dibiarkan utuh (KEEP_LAST_ASSISTANT dari belakang).
    const protectedIds = new Set<string>();
    let kept = 0;
    for (let i = messages.length - 1; i >= 0 && kept < KEEP_LAST_ASSISTANT; i--) {
      const m = messages[i];
      if (m && m.role === "assistant" && rememberedIds.has(m.id)) {
        protectedIds.add(m.id);
        kept++;
      }
    }
    for (const m of messages) {
      if (m.role !== "assistant" || !rememberedIds.has(m.id) || protectedIds.has(m.id)) continue;
      const content = m.content as {
        parts?: Array<{ type?: string; toolInvocation?: { state?: string; toolName?: string; result?: unknown } }>;
        toolInvocations?: Array<{ state?: string; toolName?: string; result?: unknown }>;
      };
      for (const part of content.parts ?? []) {
        if (part?.type === "tool-invocation" && part.toolInvocation) maybeElide(part.toolInvocation);
      }
      for (const inv of content.toolInvocations ?? []) {
        if (inv) maybeElide(inv);
      }
    }
    return messages;
  }
}
