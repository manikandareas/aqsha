import { assertEmbeddingEnabled } from "@aqsha/services/rag";
import { Mastra } from "@mastra/core/mastra";
import { astraLite, astraPro } from "./agents/astra-lite";
import { createClerkAuth } from "./auth";
import { userContextMiddleware } from "./middleware/user-context";
import { storage, vector } from "./storage";
import { deepResearch } from "./workflows/deep-research";

// Fail-fast (D1): tool `search_thread_documents` butuh embedding aktif. Konsisten dengan throw
// `DATABASE_URL` di `./storage` — kredensial wajib digagalkan saat boot, bukan degradasi senyap.
assertEmbeddingEnabled();

/**
 * Instance Mastra runtime Astra (Fase 0 spike).
 *
 * Topologi: server Mastra (Hono) berdiri sendiri sebagai `@aqsha/agent`; `apps/web` akan
 * mem-proxy same-origin ke sini (Fase 1). `apps/api` Elysia tetap REST non-agent.
 *
 * - `agents`: key = id agent (dipakai di route `/api/agents/:id/*`).
 * - `storage` + `vectors`: satu Postgres bersama (tabel `mastra_*`); juga dipakai Memory.
 * - `server.auth`: MastraAuthClerk — memverifikasi bearer Clerk DI SEMUA route (termasuk
 *   stream/subscribe), supaya tak ada endpoint stream-GET tanpa cek ownership. resourceId
 *   diturunkan dari Clerk `sub` (lihat `./auth.ts`).
 *
 * OPEN-Q-1 (resolusi Fase 0): route agent STANDAR Mastra (`/api/agents/:id/stream*`,
 * memory thread/resource, tool-approval) + `@mastra/client-js` (reconnect) sudah memenuhi
 * gate chat (stream+persist+auth+resume) TANPA membungkus Harness/AgentController.
 *
 * `/deep` = Workflow `deep-research` (Fase 2), diekspos di route standar
 * `/api/workflows/deep-research/*` (start/stream/resume/observe), dijaga `server.auth` yang
 * sama. `server.auth` menjaga SEMUA route (agent + workflow).
 */
export const mastra = new Mastra({
  agents: { "astra-lite": astraLite, "astra-pro": astraPro },
  workflows: { "deep-research": deepResearch },
  storage,
  vectors: { pg: vector },
  server: {
    port: Number(process.env.PORT ?? 4111),
    host: process.env.HOST ?? "0.0.0.0",
    auth: createClerkAuth(),
    // userContextMiddleware: ekstrak email Clerk → RequestContext (gate admin billing).
    middleware: [userContextMiddleware],
  },
});
