import { injectVizBlocks } from "@aqsha/chat-core/deep-viz";
import type { BackgroundTask, BackgroundTaskManager } from "@mastra/core/background-tasks";
import { createBackgroundTask } from "@mastra/core/background-tasks";
import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { counterEvidence } from "../agents/counter-evidence";
import { deepWriter } from "../agents/deep-writer";
import { literatureSearcher } from "../agents/literature-searcher";
import { AQSHA_AGENT_KIND_KEY, type AgentKind } from "../lib/tool-context";
import { liteProviderOptions, proProviderOptions, proSearchProviderOptions } from "../model";

/**
 * Subagent `/deep` sebagai BACKGROUND TASK persisten (`mastra_background_tasks`).
 *
 * Setiap pemanggilan subagent pasca-billing (search per sub-Q, counter-evidence, synthesize;
 * verify-citations kini deterministik tanpa LLM) di-dispatch sebagai task dengan
 * `toolCallId` DETERMINISTIK (`<runId>:<step>[...]`).
 * Dua manfaat durability:
 *
 * 1. **Restart run idempoten**: `run.restart()` / restart proses agent → step yang re-run
 *    menemukan task lama by `toolCallId`: `completed` → hasil dipakai ulang dari kolom `result`
 *    (subagent TIDAK dijalankan ulang → `external_search` TIDAK di-debit ulang); non-terminal →
 *    executor di-register ulang lalu ditunggu, bukan dijalankan dobel.
 * 2. **Selamat restart proses**: task `running`/`pending` dipulihkan `recoverStaleTasks` saat boot —
 *    eksekusinya butuh executor STATIC yang di-register ulang di `registerDeepTaskExecutors`
 *    (dipanggil dari `index.ts`; manager TIDAK merehidrasi closure dari storage).
 *
 * `args` task WAJIB self-contained & JSON-serializable (prompt + entries RequestContext) supaya
 * executor static bisa membangun ulang panggilan tanpa closure.
 */

/** Subagent yang boleh dijalankan sebagai task — key = id agent (dipakai juga sebagai `agentId` task). */
// `citation-verifier` DIHAPUS: step verify kini memanggil CitationService langsung tanpa
// LLM — task warisan ber-agentId itu (pre-deploy) akan gagal recover, lalu step re-run jalur baru.
const DEEP_TASK_AGENTS = {
  "literature-searcher": literatureSearcher,
  "counter-evidence": counterEvidence,
  "deep-writer": deepWriter,
} as const;
type DeepTaskAgentId = keyof typeof DEEP_TASK_AGENTS;

/** Nama tool task (identitas executor static — stabil lintas restart, JANGAN diganti sembarangan). */
export const DEEP_TASK_TOOL_NAME = "deep-subagent-generate";

/** Payload `args` task — seluruhnya JSON-serializable (dipersist ke `mastra_background_tasks.args`). */
type DeepTaskArgs = {
  agentId: DeepTaskAgentId;
  prompt: string;
  /** `RequestContext.entries()` ter-serialize — dibangun ulang di executor. */
  requestContext: [string, unknown][];
  /** `"none"` untuk langkah menulis (synthesize) — paksa teks, bukan tool-call. */
  toolChoice?: "none";
};

/** Hasil task (kolom `result`) — subset output `.generate()` yang dipakai step. */
type DeepTaskResult = { text: string; reasoningText?: string };

/**
 * `providerOptions` penalaran per (tier, subagent). Run pro tetap `proModel` untuk SEMUA subagent,
 * tapi `literature-searcher` memakai effort search yang diturunkan (`proSearchProviderOptions`) —
 * fase fan-out terbanyak-panggilan; penalaran dalam disimpan untuk counter-evidence + writer.
 */
function deepProviderOptionsFor(agentKind: AgentKind, agentId: DeepTaskAgentId): Record<string, unknown> {
  const opts =
    agentKind === "pro"
      ? agentId === "literature-searcher"
        ? proSearchProviderOptions
        : proProviderOptions
      : liteProviderOptions;
  return opts ? { providerOptions: opts } : {};
}

/**
 * Eksekusi sesungguhnya — dipakai executor task DAN fallback foreground (manager mati/test env).
 * `abortSignal` (opsional) diteruskan ke `agent.generate` supaya Stop/timeout benar-benar
 * membatalkan panggilan LLM in-flight — bukan sekadar menandai record task `cancelled`/`timed_out`
 * lalu membuang hasilnya. Mastra memasok signal ini via `options.abortSignal` di executor task
 * (satu controller dgn timeout task), dan jalur foreground meneruskan `params.abortSignal`.
 */
async function executeDeepGenerate(
  rawArgs: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<DeepTaskResult> {
  const args = rawArgs as DeepTaskArgs;
  const agent = DEEP_TASK_AGENTS[args.agentId];
  if (!agent) throw new Error(`deep task: unknown subagent id "${String(args.agentId)}"`);
  const rc = new RequestContext(args.requestContext as [string, {} | undefined][]);
  const agentKind: AgentKind = rc.get(AQSHA_AGENT_KIND_KEY) === "pro" ? "pro" : "lite";
  const out = await agent.generate(args.prompt, {
    requestContext: rc,
    ...deepProviderOptionsFor(agentKind, args.agentId),
    ...(args.toolChoice ? { toolChoice: args.toolChoice } : {}),
    ...(abortSignal ? { abortSignal } : {}),
  });
  const reasoning = (out.reasoningText ?? "").trim();
  return { text: out.text, ...(reasoning ? { reasoningText: reasoning } : {}) };
}

/**
 * Executor static — satu untuk semua subagent (routing via `args.agentId`). Parameter kedua
 * (`ToolExecutor` options) membawa `abortSignal` yang di-abort Mastra saat `manager.cancel()`
 * ATAU saat task melewati `timeoutMs` — diteruskan ke `agent.generate` agar generasi berhenti.
 */
const deepTaskExecutor = {
  execute: (args: Record<string, unknown>, options?: { abortSignal?: AbortSignal }) =>
    executeDeepGenerate(args, options?.abortSignal),
};

/**
 * Register executor static ke manager — WAJIB dipanggil saat boot (`index.ts`) supaya task yang
 * dipulihkan `recoverStaleTasks` (dispatch oleh proses sebelumnya) bisa dieksekusi ulang.
 */
export function registerDeepTaskExecutors(mastra: Mastra): void {
  mastra.backgroundTaskManager?.registerStaticExecutor(DEEP_TASK_TOOL_NAME, deepTaskExecutor);
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timed_out"]);

function normalizeResult(result: unknown): DeepTaskResult {
  const r = (result ?? {}) as { text?: unknown; reasoningText?: unknown };
  return {
    text: typeof r.text === "string" ? r.text : "",
    ...(typeof r.reasoningText === "string" && r.reasoningText
      ? { reasoningText: r.reasoningText }
      : {}),
  };
}

/** Margin di atas timeout task sendiri — beri waktu engine menandai `timed_out` lebih dulu. */
const STALE_WAIT_MARGIN_MS = 30_000;

/**
 * Batas tunggu untuk task LAMA = sisa umur task itu sendiri (`startedAt ?? createdAt` +
 * `task.timeoutMs` + margin) — BUKAN full timeout baru. Task stale (eksekutor proses lama mati,
 * recovery tak menyentuh) punya deadline di masa lalu → loop wait langsung keluar → dispatch
 * attempt baru segera, alih-alih klik "Mulai ulang" terasa hang ~10 menit. Catatan: record
 * `BackgroundTask` TIDAK punya `updatedAt`, jadi anchor umurnya `startedAt ?? createdAt`.
 * Tetap di-cap timeout step pemanggil.
 */
function existingTaskDeadline(task: BackgroundTask, callerTimeoutMs: number): number {
  const anchor = new Date(task.startedAt ?? task.createdAt).getTime();
  return Math.min(anchor + task.timeoutMs + STALE_WAIT_MARGIN_MS, Date.now() + callerTimeoutMs);
}

/**
 * Attempt yang satu identitas logis dgn `base` = base persis ATAU suffix retry `:r<N>:<ts>`.
 * BUKAN prefix polos: `:empty-retry` adalah kunci logis BERBEDA (retry khusus turn subagent
 * yang selesai tanpa teks), dan `search:1` tak boleh mencocokkan `search:10`.
 */
function isAttemptOf(toolCallId: string, base: string): boolean {
  return toolCallId === base || toolCallId.startsWith(`${base}:r`);
}

/**
 * Hasil `completed` layak reuse hanya bila MEMBAWA TEKS YANG BERGUNA. Task completed ber-`text:""`
 * (turn senyap / result malformed yang dipaksa kosong `normalizeResult`) yang di-reuse membuat
 * synthesize gagal PERMANEN: throw laporan-kosong → retry/time-travel menemukan task "completed"
 * yang sama → tak pernah dispatch attempt baru — kredit run hangus tanpa jalur pulih. Empty
 * completed diperlakukan seperti terminal non-completed → attempt baru ber-suffix (untuk search
 * ini berarti re-riset sub-Q yang hasilnya memang kosong/tak berguna — debit ulang yang membeli
 * jawaban nyata). Teks yang HANYA berisi fence ```aqsha:viz / marker viz palsu dinilai kosong
 * juga: synthesize men-strip-nya (anti-forgery) lalu throw laporan-kosong, jadi me-reuse hasil
 * seperti itu mengunci retry pada kegagalan yang sama.
 */
function completedWithText(task: BackgroundTask): boolean {
  const text = normalizeResult(task.result).text;
  if (text.trim().length === 0) return false;
  return injectVizBlocks(text, []).report.trim().length > 0;
}

/** Poll sampai task terminal (getTask baca storage — andal juga untuk task yang dipulihkan).
 *  Deadline ABSOLUT (epoch ms); abort run → tutup task lalu lempar. */
async function waitUntilTerminal(
  manager: BackgroundTaskManager,
  taskId: string,
  deadlineMs: number,
  abortSignal?: AbortSignal,
): Promise<BackgroundTask | null> {
  while (Date.now() < deadlineMs) {
    if (abortSignal?.aborted) {
      await manager.cancel(taskId).catch(() => {});
      throw new Error("deep task dibatalkan: run di-cancel");
    }
    const task = await manager.getTask(taskId);
    if (!task) return null;
    if (TERMINAL_STATUSES.has(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

/**
 * Jalankan satu pemanggilan subagent `/deep` sebagai background task persisten.
 *
 * - Manager tak tersedia (backgroundTasks off / unit test) → fallback FOREGROUND (eksekusi
 *   langsung tanpa persist).
 * - Task lama satu identitas logis (base ATAU attempt ber-suffix `:r<N>:<ts>`): `completed`
 *   BER-TEKS → reuse hasil (no re-run/no re-debit); `pending/running/suspended` → register ulang
 *   executor + tunggu maksimal sisa umur task itu (melewati deadline → di-cancel supaya tak
 *   jalan dobel); semua terminal non-completed (atau completed kosong) → dispatch BARU dgn suffix
 *   percobaan berikutnya.
 * - Throw hanya bila task baru berakhir non-completed — pemanggil (step) yang memutuskan isolasi
 *   (searchStep menangkap per sub-Q; step ber-`retries` biarkan workflow yang mengulang).
 */
export async function runDeepSubagentTask(params: {
  mastra: Mastra | undefined;
  toolCallId: string;
  args: DeepTaskArgs;
  runId: string;
  threadId: string;
  resourceId?: string;
  timeoutMs: number;
  /** abortSignal step (dipicu `run.cancel()`) — Stop dari user menutup task run ini alih-alih membiarkannya jalan terus. */
  abortSignal?: AbortSignal;
}): Promise<DeepTaskResult> {
  const manager = params.mastra?.backgroundTaskManager;
  if (!manager) return executeDeepGenerate(params.args, params.abortSignal);
  if (params.abortSignal?.aborted) throw new Error("deep task dibatalkan: run di-cancel");

  let toolCallId = params.toolCallId;
  try {
    // List per-RUN (bukan exact `toolCallId` — filter storage exact-match) supaya attempt
    // ber-suffix `:r<N>:<ts>` yang BERHASIL ikut ditemukan saat restart; dulu attempt sukses itu
    // tak terlihat → sub-Q diriset (dan didebit `external_search`) ulang.
    const { tasks } = await manager.listTasks({
      runId: params.runId,
      orderBy: "createdAt",
      orderDirection: "desc",
      // Fan-out satu run: ≤8 sub-Q × (base + empty-retry + suffix retry) + counter + synthesize.
      perPage: 100,
    });
    const attempts = tasks.filter((t) => isAttemptOf(t.toolCallId, params.toolCallId));
    // Prioritas: (1) completed BER-TEKS terbaru → reuse hasil (no re-run / no re-debit);
    const completed = attempts.find((t) => t.status === "completed" && completedWithText(t));
    if (completed) return normalizeResult(completed.result);
    // (2) non-terminal TERBARU → register ulang executor + tunggu ber-deadline sisa umur task;
    const active = attempts.find((t) => !TERMINAL_STATUSES.has(t.status));
    if (active) {
      manager.registerTaskContext(active.id, { executor: deepTaskExecutor });
      const done = await waitUntilTerminal(
        manager,
        active.id,
        existingTaskDeadline(active, params.timeoutMs),
        params.abortSignal,
      );
      if (done?.status === "completed" && completedWithText(done)) return normalizeResult(done.result);
      // Stale melewati deadline / hilang dari storage → CANCEL dulu sebelum attempt baru: record
      // `cancelled` membuat antrean melewatinya (engine hanya skip task cancelled saat dispatch).
      // Tanpa ini task lama yang ternyata masih hidup (pending antrean backlog / re-dispatch
      // `recoverStaleTasks` ber-`startedAt` kosong) ikut jalan → subagent DOBEL + debit dobel.
      // Kooperatif: eksekusi yang sudah in-flight bisa tuntas internal (hasil dibuang).
      if (!done || !TERMINAL_STATUSES.has(done.status)) {
        await manager.cancel(active.id).catch(() => {});
      }
      // Gagal/timeout/stale/hilang → jatuh ke dispatch percobaan baru di bawah.
    }
    // (3) semua attempt terminal non-completed (atau completed tanpa teks) → attempt baru ber-suffix.
    if (attempts.length > 0) {
      toolCallId = `${params.toolCallId}:r${(attempts[0]?.retryCount ?? 0) + 1}:${Date.now()}`;
    }
  } catch (err) {
    // Abort ≠ blip lookup — jangan lanjut dispatch attempt baru untuk run yang dibatalkan.
    if (params.abortSignal?.aborted) throw err;
    // Dedupe best-effort — kegagalan lookup tak boleh mematikan step; lanjut dispatch baru.
    console.error("[deep-tasks] task lookup failed", err);
  }

  // Abort bisa mendarat SELAMA lookup di atas (await panjang) — listener `abort` di bawah
  // dipasang SETELAHNYA dan event pada signal yang sudah aborted tak pernah fire (spec WHATWG),
  // jadi tanpa cek ulang ini task baru lahir + ditunggu full timeout untuk run yang dibatalkan.
  if (params.abortSignal?.aborted) throw new Error("deep task dibatalkan: run di-cancel");

  const handle = createBackgroundTask(manager, {
    runId: params.runId,
    toolName: DEEP_TASK_TOOL_NAME,
    toolCallId,
    args: params.args as unknown as Record<string, unknown>,
    agentId: params.args.agentId,
    threadId: params.threadId,
    ...(params.resourceId ? { resourceId: params.resourceId } : {}),
    timeoutMs: params.timeoutMs,
    context: { executor: deepTaskExecutor },
  });
  // Run di-cancel → tutup task yang baru di-dispatch. `manager.cancel()` (dipicu handle.cancel())
  // men-abort controller task di `activeAbortControllers`; controller itu diteruskan Mastra ke
  // executor sebagai `options.abortSignal` → `deepTaskExecutor` mengopernya ke `agent.generate`,
  // jadi panggilan LLM in-flight IKUT ter-abort (generasi berhenti, kredit `search_*` tak
  // terlanjur habis). Wait di bawah tetap keluar dini via status terminal `cancelled`.
  const onAbort = () => void handle.cancel().catch(() => {});
  params.abortSignal?.addEventListener("abort", onAbort, { once: true });
  // Tutup jendela race tersisa (abort mendarat di antara cek ulang di atas dan addEventListener).
  if (params.abortSignal?.aborted) onAbort();
  try {
    const { fallbackToSync } = await handle.dispatch();
    if (fallbackToSync) return executeDeepGenerate(params.args, params.abortSignal);
    const done = await handle.waitForCompletion({ timeoutMs: params.timeoutMs + STALE_WAIT_MARGIN_MS });
    if (done.status !== "completed") {
      throw new Error(
        `deep background task ${params.args.agentId} berakhir ${done.status}${
          done.error ? `: ${done.error.message}` : ""
        }`,
      );
    }
    return normalizeResult(done.result);
  } finally {
    params.abortSignal?.removeEventListener("abort", onAbort);
  }
}
