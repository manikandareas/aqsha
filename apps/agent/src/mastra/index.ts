import { assertEmbeddingEnabled } from "@aqsha/services/rag";
import { Mastra } from "@mastra/core/mastra";
import { MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import type { Middleware } from "@mastra/core/server";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { astraLite, astraPro } from "./agents/astra-lite";
import { createClerkAuth } from "./auth";
import {
  AQSHA_AGENT_KIND_KEY,
  AQSHA_CHAT_TURN_KEY,
  AQSHA_DEEP_RUN_KEY,
  AQSHA_DEEP_SUBQ_INDEX_KEY,
} from "./lib/tool-context";
import { userContextMiddleware } from "./middleware/user-context";
import { storage, vector } from "./storage";
import { deepResearch } from "./workflows/deep-research";
import { registerDeepTaskExecutors } from "./workflows/deep-tasks";

// Fail-fast (D1): tool `search_thread_documents` butuh embedding aktif. Konsisten dengan throw
// `DATABASE_URL` di `./storage` — kredensial wajib digagalkan saat boot, bukan degradasi senyap.
assertEmbeddingEnabled();

// Sweep A1 hanya boleh jalan SEKALI per proses — flag di-set sinkron sebelum panggilan async
// supaya request paralel pertama tak memicu sweep ganda. Impl `sweepFrozenDeepRunsOnce` di bawah
// instance `mastra` (butuh instance-nya); deklarasi function di-hoist, aman dirujuk dari sini.
let deepBootSweepStarted = false;
const bootSweepMiddleware: Middleware = async (_c, next) => {
  sweepFrozenDeepRunsOnce();
  await next();
};

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
  // IMP-7: observability dasar — trace agent/workflow/tool/LLM dipersist ke storage Postgres yang
  // sama (tabel observability `mastra_*`, terbaca di Mastra Studio). Metadata span membawa
  // threadId/run deep/turn chat/tier dari RequestContext → ledger kosong (mis. CFG-6) & bobot
  // token history terlihat dari trace prod, bukan tebakan. Email SENGAJA tidak diekstrak (PII).
  // `SensitiveDataFilter` auto-aktif. Matikan via env `AQSHA_OBSERVABILITY=off`.
  ...(process.env.AQSHA_OBSERVABILITY === "off"
    ? {}
    : {
        observability: new Observability({
          configs: {
            default: {
              serviceName: "aqsha-agent",
              exporters: [new MastraStorageExporter()],
              requestContextKeys: [
                MASTRA_THREAD_ID_KEY,
                AQSHA_DEEP_RUN_KEY,
                AQSHA_CHAT_TURN_KEY,
                AQSHA_AGENT_KIND_KEY,
                AQSHA_DEEP_SUBQ_INDEX_KEY,
              ],
            },
          },
        }),
      }),
  // DUR-7: subagent `/deep` jalan sebagai background task persisten (`mastra_background_tasks`,
  // storage Postgres yang sama) → selamat restart proses + restart run me-reuse hasil task selesai
  // (tanpa re-debit `external_search`). Concurrency ≥ fan-out search (subQuestions ≤ 8) supaya
  // paralelisme pra-DUR-7 tak menyempit; backpressure default `queue`.
  backgroundTasks: {
    enabled: true,
    globalConcurrency: 16,
    perAgentConcurrency: 8,
    defaultTimeoutMs: 600_000,
  },
  server: {
    port: Number(process.env.PORT ?? 4111),
    host: process.env.HOST ?? "0.0.0.0",
    auth: createClerkAuth(),
    // userContextMiddleware: ekstrak email Clerk → RequestContext (gate admin billing).
    // bootSweepMiddleware: sweep A1 run beku, terpicu request pertama (lihat komentar di bawah).
    middleware: [userContextMiddleware, bootSweepMiddleware],
  },
});

/**
 * A1 (audit 2026-07-03): sweep run `deep-research` yang beku karena proses mati (deploy Dokploy =
 * restart container; Mastra 1.47 tak me-resume run `running` sendiri). Hanya menyapu
 * `running`+`waiting` (bukan `suspended` — run parkir di gerbang HITL sehat, di-resume user);
 * step yang re-run me-reuse task selesai by `toolCallId` (DUR-7) → tanpa re-debit. Fire-and-forget:
 * kegagalan sweep (mis. storage belum siap) tak boleh mematikan server; error per-run ditangkap
 * internal. Scoped per-workflow (bukan facade `mastra.*`) supaya workflow internal Mastra
 * (`__mastra_notification_dispatcher`) tak ikut tersapu.
 *
 * Dipicu REQUEST HTTP PERTAMA (middleware), BUKAN import module: modul ini juga di-import smoke
 * scripts / build / test yang menunjuk DB sama — sweep dari proses sekali-jalan me-restart run
 * milik user lalu mati di tengah (membekukan ulang, bisa dobel-dispatch task). Hanya proses yang
 * benar-benar melayani HTTP yang boleh men-sweep; saat request pertama tiba, `startWorkers()`
 * deployer juga sudah jalan (urutan boot), jadi task hasil restart tak menganggur di antrean.
 * Run beku selalu tersentuh: FE poll re-attach memukul server begitu ada user membuka thread-nya.
 */
function sweepFrozenDeepRunsOnce(): void {
  if (deepBootSweepStarted) return;
  deepBootSweepStarted = true;
  void mastra
    .getWorkflow("deep-research")
    .restartAllActiveWorkflowRuns()
    .catch((err) => console.error("[deep-research] boot sweep restart gagal", err));
}

// Executor static task `/deep` WAJIB di-register saat boot: task `running`/`pending` yang dipulihkan
// `recoverStaleTasks` (proses sebelumnya mati) hanya bisa dieksekusi ulang lewat registry ini —
// manager tidak merehidrasi closure dari storage. Registrasi murni in-memory (aman saat build).
registerDeepTaskExecutors(mastra);
