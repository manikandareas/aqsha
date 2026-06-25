import { type ChatThreadEvent, ChatThreadEventRepo, type DbOrTx } from "@aqsha/db";

/**
 * EventService — path BACA event stream eve per thread (fix timeline persist), dipakai
 * route api-v2. Klien me-replay event ini lewat `defaultMessageReducer` eve → timeline
 * reload == live, dan progress in-flight tetap terlihat saat refresh (klien poll selagi
 * turn jalan). Path TULIS hidup di PROSES eve (`apps/agent-v2/agent/lib/store.ts`, raw SQL).
 */
export const EventService = {
  /** Event stream thread (urut `event_index`). UNGATED — route memanggil `ThreadService.assertOwner` dulu. */
  async listByThread(db: DbOrTx, threadId: string): Promise<ChatThreadEvent[]> {
    return ChatThreadEventRepo.listByThread(db, threadId);
  },
};
