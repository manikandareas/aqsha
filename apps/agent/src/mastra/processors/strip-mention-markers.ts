import { stripMentionMarkers } from "@aqsha/chat-core";
import type { ProcessInputArgs } from "@mastra/core/processors";

/**
 * Buang penanda `@mention` (private-use U+E000/U+E001) dari teks pesan USER sebelum sampai ke LLM.
 *
 * Composer menyisipkan penanda di sekeliling label mention (`serializeComposerEditorWithMarkers`)
 * lalu mengirim + mempersist varian ber-marker itu sebagai pesan user, supaya FE bisa merender
 * mention sebagai pill (live maupun setelah refresh, dari Mastra Memory = SoT). Penanda HANYA untuk
 * tampilan — model tak boleh melihatnya. Processor input ini men-strip-nya tiap giliran (termasuk
 * pesan riwayat yang di-recall), jadi LLM selalu menerima teks bersih.
 *
 * Memutasi salinan pesan yang DIMUAT untuk panggilan ini (bukan baris tersimpan di DB) → storage
 * tetap menyimpan varian ber-marker untuk render pill. `stripMentionMarkers` idempoten, jadi aman
 * walau objek pesan dipakai ulang.
 */
export const stripMentionMarkersProcessor = {
  id: "strip-mention-markers" as const,
  processInput({ messages }: ProcessInputArgs) {
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
  },
};
