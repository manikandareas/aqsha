import { Elysia } from "elysia";
import { logger } from "../lib/log";

/**
 * Observability global: mint `requestId` per-request (tersedia di handler + onError
 * via errorPlugin) + access-log satu baris saat response selesai
 * `{ requestId, method, path, status, ms }`. `requestId` dikembalikan errorPlugin di
 * payload 500 → error klien bisa dicocokkan ke baris log server.
 */
export const observability = new Elysia({ name: "observability" })
  .derive({ as: "global" }, () => ({
    requestId: crypto.randomUUID(),
    reqStart: performance.now(),
  }))
  .onAfterResponse({ as: "global" }, ({ request, path, set, requestId, reqStart }) => {
    logger.info(
      {
        requestId,
        method: request.method,
        path,
        status: typeof set.status === "number" ? set.status : undefined,
        ms: Math.round(performance.now() - reqStart),
      },
      "request",
    );
  });
