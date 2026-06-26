import { ChatMessageRepo, ChatThreadRepo, type Db, type DbOrTx } from "@aqsha/db";
import { generateThreadTitle } from "../clients/llm";
import { CHAT_QUEUES, enqueue } from "../clients/queue";
import { collapse } from "../lib/text";

const TITLE_MAX = 120;

/**
 * Auto-title thread (Slice 6.8). DUA fase, dua proses:
 * - `requestTitle` dipanggil hook proyeksi eve di `turn.completed` (PROSES eve, dist).
 *   Klaim atomik (`title_status: null → 'generating'`) = guard turn-pertama + rename-manual,
 *   lalu enqueue job (dedup `jobId = threadId`). Hanya enqueue bila klaim menang.
 * - `generate` dijalankan worker BullMQ (PROSES api). Ambil pesan user pertama →
 *   LLM → tulis judul ber-guard `title_status = 'generating'` (rename antara claim↔generate
 *   tak ketimpa).
 */
export const TitleService = {
  /** Klaim + enqueue. No-op (return false) bila bukan turn pertama / sudah di-rename. */
  async requestTitle(db: DbOrTx, threadId: string): Promise<boolean> {
    const claimed = await ChatThreadRepo.claimTitleGeneration(db, threadId);
    if (!claimed) return false;
    await enqueue(CHAT_QUEUES.threadTitle, { threadId }, { jobId: threadId });
    return true;
  },

  /** Worker: generate judul dari pesan user pertama → finalize ber-guard. */
  async generate(db: Db, threadId: string): Promise<void> {
    const messages = await ChatMessageRepo.listByThread(db, threadId);
    const firstUser = messages.find((m) => m.role === "user");
    const source = collapse(firstUser?.text);
    if (!source) return; // tak ada pesan user → biarkan status 'generating' (job tak retry sukses)

    const raw = await generateThreadTitle(source.slice(0, 2000));
    const title = collapse(raw).replace(/^["'""]|["'""]$/g, "");
    if (!title) return;
    await ChatThreadRepo.finalizeTitle(db, threadId, title.slice(0, TITLE_MAX));
  },
};
