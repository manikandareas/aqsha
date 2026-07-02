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

/** Poll sampai task terminal (getTask baca storage — andal juga untuk task yang dipulihkan). */
async function waitUntilTerminal(
  manager: BackgroundTaskManager,
  taskId: string,
  timeoutMs: number,
): Promise<BackgroundTask | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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
 * - Task lama dgn `toolCallId` sama: `completed` → reuse hasil (no re-run/no re-debit);
 *   `pending/running/suspended` → register ulang executor + tunggu; `failed/timed_out/cancelled`
 *   → dispatch BARU dgn suffix percobaan (`:r<N>`).
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
}): Promise<DeepTaskResult> {
  const manager = params.mastra?.backgroundTaskManager;
  if (!manager) return executeDeepGenerate(params.args);

  let toolCallId = params.toolCallId;
  try {
    const { tasks } = await manager.listTasks({
      toolCallId: params.toolCallId,
      runId: params.runId,
      perPage: 10,
    });
    // Bisa >1 (percobaan ber-suffix listTasks by toolCallId dasar tak ikut) — ambil terbaru.
    const existing = tasks[0];
    if (existing) {
      if (existing.status === "completed") return normalizeResult(existing.result);
      if (!TERMINAL_STATUSES.has(existing.status)) {
        manager.registerTaskContext(existing.id, { executor: deepTaskExecutor });
        const done = await waitUntilTerminal(manager, existing.id, params.timeoutMs);
        if (done?.status === "completed") return normalizeResult(done.result);
        // Gagal/timeout/hilang → jatuh ke dispatch percobaan baru di bawah.
      }
      toolCallId = `${params.toolCallId}:r${existing.retryCount + 1}:${Date.now()}`;
    }
  } catch (err) {
    // Dedupe best-effort — kegagalan lookup tak boleh mematikan step; lanjut dispatch baru.
    console.error("[deep-tasks] task lookup failed", err);
  }

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
  const { fallbackToSync } = await handle.dispatch();
  if (fallbackToSync) return executeDeepGenerate(params.args);
  const done = await handle.waitForCompletion({ timeoutMs: params.timeoutMs + 30_000 });
  if (done.status !== "completed") {
    throw new Error(
      `deep background task ${params.args.agentId} berakhir ${done.status}${
        done.error ? `: ${done.error.message}` : ""
      }`,
    );
  }
  return normalizeResult(done.result);
}
