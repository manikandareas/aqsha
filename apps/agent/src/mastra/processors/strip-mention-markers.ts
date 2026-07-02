import { stripMentionMarkers } from "@aqsha/chat-core";
import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type { ProcessInputArgs, ProcessInputStepArgs } from "@mastra/core/processors";

/**
 * Buang penanda `@mention` (private-use U+E000/U+E001) dari teks pesan USER sebelum sampai ke LLM.
 *
 * Composer menyisipkan penanda di sekeliling label mention (`serializeComposerEditorWithMarkers`)
 * lalu mengirim + mempersist varian ber-marker itu sebagai pesan user, supaya FE bisa merender
 * mention sebagai pill (live maupun setelah refresh, dari Mastra Memory = SoT). Penanda HANYA untuk
 * tampilan — model tak boleh melihatnya.
 *
 * DUA hook (CTX-4):
 * - `processInput`: pesan BARU giliran ini (jalan sekali, sebelum token-count & processor lain).
 * - `processInputStep`: SEMUA pesan yang dikirim ke LLM tiap step — runner Mastra memuat pesan
 *   history/recall via `messageList.add(msg, "memory")` TANPA melewati `processInput`, jadi tanpa
 *   hook ini tiap pesan riwayat ber-mention diputar ulang dengan karakter PUA di setiap giliran.
 *
 * Memutasi salinan pesan yang DIMUAT untuk panggilan ini (bukan baris tersimpan di DB) — pesan
 * bersumber `memory` TIDAK ikut `drainUnsavedMessages`, jadi storage tetap menyimpan varian
 * ber-marker untuk render pill. `stripMentionMarkers` idempoten, aman dipanggil berulang per step.
 *
 * Sisa yang DITERIMA: query embedding semantic-recall dihitung Memory dari pesan user mentah
 * (sebelum processor) — polusi 2 karakter PUA per mention, dampak minor; tak ada titik cegat
 * yang bersih di Mastra 1.47.
 */
function stripMessages(messages: MastraDBMessage[]): MastraDBMessage[] {
  for (const m of messages) {
    if (m.role !== "user") continue;
    const content = m.content as { content?: unknown; parts?: Array<{ type?: string; text?: unknown }> };
    if (typeof content.content === "string") {
      content.content = stripMentionMarkers(content.content);
    }
    for (const p of content.parts ?? []) {
      if (p?.type === "text" && typeof p.text === "string") {
        p.text = stripMentionMarkers(p.text);
      }
    }
  }
  return messages;
}

export const stripMentionMarkersProcessor = {
  id: "strip-mention-markers" as const,
  processInput({ messages }: ProcessInputArgs) {
    return stripMessages(messages);
  },
  processInputStep({ messages }: ProcessInputStepArgs) {
    return stripMessages(messages);
  },
};
