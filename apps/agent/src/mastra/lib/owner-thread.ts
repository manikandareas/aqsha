import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  type RequestContext,
} from "@mastra/core/request-context";

/**
 * Resolusi owner + threadId untuk processor turn-level (thread-projection, artifact-manifest).
 *
 * Sumber utama = pesan tersimpan (`MastraDBMessage.threadId`/`.resourceId` — SoT yang selalu
 * terisi saat memory thread aktif), fallback ke RequestContext. Tidak bergantung pada
 * `MASTRA_THREAD_ID_KEY` semata karena Mastra bisa menyimpan threadId di memoryContext (bukan
 * RequestContext) saat klien mengirimnya via opsi `memory`.
 */
type MessageLike = { threadId?: string; resourceId?: string };

export function ctxValue(rc: RequestContext | undefined, key: string): string | null {
  const raw = rc?.get(key);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function resolveOwnerThread(
  rc: RequestContext | undefined,
  messages: readonly MessageLike[],
): { ownerUserId: string | null; threadId: string | null } {
  return {
    threadId: messages.find((m) => m.threadId)?.threadId ?? ctxValue(rc, MASTRA_THREAD_ID_KEY),
    ownerUserId:
      messages.find((m) => m.resourceId)?.resourceId ?? ctxValue(rc, MASTRA_RESOURCE_ID_KEY),
  };
}
