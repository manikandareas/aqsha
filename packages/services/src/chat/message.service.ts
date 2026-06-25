import { type ChatMessage, ChatMessageRepo, type DbOrTx } from "@aqsha/db";

/**
 * MessageService — path BACA transkrip thread Astra (Fase 6), dipakai route api-v2.
 * Path TULIS pesan (record user/assistant) hidup di PROSES eve
 * (`apps/web-v2/agent/lib/store.ts`, raw SQL) — lihat catatan `thread.service.ts`.
 */
export const MessageService = {
  /** Transkrip thread (kronologis). UNGATED — route memanggil `ThreadService.assertOwner` dulu. */
  async listByThread(db: DbOrTx, threadId: string): Promise<ChatMessage[]> {
    return ChatMessageRepo.listByThread(db, threadId);
  },
};
