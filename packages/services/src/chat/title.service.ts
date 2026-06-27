import { ChatThreadRepo, type Db, type DbOrTx } from "@aqsha/db";
import { generateThreadTitle } from "../clients/llm";
import { CHAT_QUEUES, enqueue } from "../clients/queue";
import { collapse } from "../lib/text";

const TITLE_MAX = 120;

/**
 * Auto-title thread. DUA fase, dua proses:
 * - `requestTitle` dipanggil `threadProjectionProcessor` agent Mastra di akhir turn. Klaim atomik
 *   (`title_status: null → 'generating'`) = guard turn-pertama + rename-manual; hanya enqueue
 *   bila klaim menang. **Seed judul (pesan user pertama) dibawa di payload job** — Mastra Memory
 *   = SoT pesan, jadi worker tak membaca tabel chat (sudah di-drop).
 * - `generate` dijalankan worker BullMQ (PROSES api): seed → LLM → tulis judul ber-guard
 *   `title_status = 'generating'` (rename antara claim↔generate tak ketimpa).
 */
export const TitleService = {
  /** Klaim + enqueue (membawa seed). No-op (return false) bila bukan turn pertama / sudah di-rename. */
  async requestTitle(db: DbOrTx, threadId: string, titleSeed?: string | null): Promise<boolean> {
    const claimed = await ChatThreadRepo.claimTitleGeneration(db, threadId);
    if (!claimed) return false;
    await enqueue(
      CHAT_QUEUES.threadTitle,
      { threadId, titleSeed: titleSeed ?? undefined },
      { jobId: threadId },
    );
    return true;
  },

  /** Worker: generate judul dari seed (pesan user pertama) → finalize ber-guard. */
  async generate(db: Db, input: { threadId: string; titleSeed?: string }): Promise<void> {
    const source = collapse(input.titleSeed);
    if (!source) return; // tak ada seed → biarkan status 'generating' (job tak retry sukses)

    const raw = await generateThreadTitle(source.slice(0, 2000));
    const title = collapse(raw).replace(/^["'“”]|["'“”]$/g, "");
    if (!title) return;
    await ChatThreadRepo.finalizeTitle(db, input.threadId, title.slice(0, TITLE_MAX));
  },
};
