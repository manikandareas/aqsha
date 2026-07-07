import type { BackgroundTask, BackgroundTaskManager } from "@mastra/core/background-tasks";
import { createBackgroundTask } from "@mastra/core/background-tasks";
import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { counterEvidence } from "../agents/counter-evidence";
import { deepWriter } from "../agents/deep-writer";
import { literatureSearcher } from "../agents/literature-searcher";
import { AQSHA_AGENT_KIND_KEY, type AgentKind } from "../lib/tool-context";
import { liteProviderOptions, proProviderOptions } from "../model";

/**
 * DUR-7 — subagent `/deep` sebagai BACKGROUND TASK persisten (`mastra_background_tasks`).
 *
 * Setiap pemanggilan subagent pasca-billing (search per sub-Q, counter-evidence, synthesize;
 * verify-citations kini deterministik tanpa LLM — IMP-5) di-dispatch sebagai task dengan
 * `toolCallId` DETERMINISTIK (`<runId>:<step>[...]`).
 * Dua manfaat durability:
 *
 * 1. **Restart run idempoten**: `run.restart()` (DUR-5) / restart proses agent → step yang re-run
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
// `citation-verifier` DIHAPUS (IMP-5): step verify kini memanggil CitationService langsung tanpa
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

function deepProviderOptionsFor(agentKind: AgentKind): Record<string, unknown> {
  const opts = agentKind === "pro" ? proProviderOptions : liteProviderOptions;
  return opts ? { providerOptions: opts } : {};
}

/** Eksekusi sesungguhnya — dipakai executor task DAN fallback foreground (manager mati/test env). */
async function executeDeepGenerate(rawArgs: Record<string, unknown>): Promise<DeepTaskResult> {
  const args = rawArgs as DeepTaskArgs;
  const agent = DEEP_TASK_AGENTS[args.agentId];
  if (!agent) throw new Error(`deep task: unknown subagent id "${String(args.agentId)}"`);
  const rc = new RequestContext(args.requestContext as [string, {} | undefined][]);
  const agentKind: AgentKind = rc.get(AQSHA_AGENT_KIND_KEY) === "pro" ? "pro" : "lite";
  const out = await agent.generate(args.prompt, {
    requestContext: rc,
    ...deepProviderOptionsFor(agentKind),
    ...(args.toolChoice ? { toolChoice: args.toolChoice } : {}),
  });
  const reasoning = (out.reasoningText ?? "").trim();
  return { text: out.text, ...(reasoning ? { reasoningText: reasoning } : {}) };
}

/** Executor static — satu untuk semua subagent (routing via `args.agentId`). */
const deepTaskExecutor = {
  execute: (args: Record<string, unknown>) => executeDeepGenerate(args),
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
 * A2: batas tunggu untuk task LAMA = sisa umur task itu sendiri (`startedAt ?? createdAt` +
 * `task.timeoutMs` + margin) — BUKAN full timeout baru. Task stale (eksekutor proses lama mati,
 * recovery tak menyentuh) punya deadline di masa lalu → loop wait langsung keluar → dispatch
 * attempt baru segera, alih-alih klik "Mulai ulang" terasa hang ~10 menit. Catatan: record
 * `BackgroundTask` TIDAK punya `updatedAt` (rekomendasi audit dikoreksi di sini). Tetap di-cap
 * timeout step pemanggil.
 */
function existingTaskDeadline(task: BackgroundTask, callerTimeoutMs: number): number {
  const anchor = new Date(task.startedAt ?? task.createdAt).getTime();
  return Math.min(anchor + task.timeoutMs + STALE_WAIT_MARGIN_MS, Date.now() + callerTimeoutMs);
}

/**
 * B5: attempt yang satu identitas logis dgn `base` = base persis ATAU suffix retry `:r<N>:<ts>`.
 * BUKAN prefix polos: `:empty-retry` adalah kunci logis BERBEDA (retry teks-kosong CTX-7), dan
 * `search:1` tak boleh mencocokkan `search:10`.
 */
function isAttemptOf(toolCallId: string, base: string): boolean {
  return toolCallId === base || toolCallId.startsWith(`${base}:r`);
}

/**
 * Hasil `completed` layak reuse hanya bila MEMBAWA TEKS. Task completed ber-`text:""` (turn senyap
 * CTX-7 / result malformed yang dipaksa kosong `normalizeResult`) yang di-reuse membuat synthesize
 * gagal PERMANEN: throw laporan-kosong → retry/time-travel menemukan task "completed" yang sama →
 * tak pernah dispatch attempt baru — kredit run hangus tanpa jalur pulih. Empty completed
 * diperlakukan seperti terminal non-completed → attempt baru ber-suffix (untuk search ini berarti
 * re-riset sub-Q yang hasilnya memang kosong/tak berguna — debit ulang yang membeli jawaban nyata).
 */
function completedWithText(task: BackgroundTask): boolean {
  return normalizeResult(task.result).text.trim().length > 0;
}

/** Poll sampai task terminal (getTask baca storage — andal juga untuk task yang dipulihkan).
 *  Deadline ABSOLUT (epoch ms, A2); abort run (B4) → tutup task lalu lempar. */
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
 * - Manager tak tersedia (backgroundTasks off / unit test) → fallback FOREGROUND (perilaku
 *   pra-DUR-7, tanpa persist).
 * - Task lama satu identitas logis (base ATAU attempt ber-suffix `:r<N>:<ts>`, B5): `completed`
 *   BER-TEKS → reuse hasil (no re-run/no re-debit); `pending/running/suspended` → register ulang
 *   executor + tunggu maksimal sisa umur task itu (A2; melewati deadline → di-cancel supaya tak
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
  /** B4: abortSignal step (dipicu `run.cancel()`) — tutup task run ini alih-alih jalan terus. */
  abortSignal?: AbortSignal;
}): Promise<DeepTaskResult> {
  const manager = params.mastra?.backgroundTaskManager;
  if (!manager) return executeDeepGenerate(params.args);
  if (params.abortSignal?.aborted) throw new Error("deep task dibatalkan: run di-cancel");

  let toolCallId = params.toolCallId;
  try {
    // B5: list per-RUN (bukan exact `toolCallId` — filter storage exact-match) supaya attempt
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
    // (2) non-terminal TERBARU → register ulang executor + tunggu ber-deadline umur task (A2);
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

  // B4: abort bisa mendarat SELAMA lookup di atas (await panjang) — listener `abort` di bawah
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
  // B4: run di-cancel → tutup task yang baru di-dispatch. KOOPERATIF & JUJUR: cancel menandai
  // record `cancelled` + wait di bawah keluar dini via status terminal itu, tapi `agent.generate`
  // in-flight TIDAK menerima signal (args task wajib JSON-serializable, tanpa closure) — panggilan
  // LLM yang sudah jalan bisa tuntas internal lalu hasilnya dibuang. Kebocoran debit `search_*`
  // mengecil (task antre/berikutnya tak pernah mulai), tidak nol.
  const onAbort = () => void handle.cancel().catch(() => {});
  params.abortSignal?.addEventListener("abort", onAbort, { once: true });
  // Tutup jendela race tersisa (abort mendarat di antara cek ulang di atas dan addEventListener).
  if (params.abortSignal?.aborted) onAbort();
  try {
    const { fallbackToSync } = await handle.dispatch();
    if (fallbackToSync) return executeDeepGenerate(params.args);
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
