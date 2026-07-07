/**
 * Smoke test DUR-7 — subagent `/deep` sebagai background task persisten (`runDeepSubagentTask`):
 * (1) dispatch task baru → executor jalan → hasil terpersist; (2) pemanggilan ULANG dengan
 * `toolCallId` sama me-REUSE hasil dari storage (cepat, tanpa model call kedua) — properti yang
 * membuat `run.restart()` (DUR-5) tidak re-debit search.
 * (3) B5: attempt ber-suffix `:r<N>:<ts>` yang completed ikut ter-reuse oleh lookup ber-base
 * (dulu tak terlihat → sub-Q diriset + didebit ulang saat restart).
 * (4) B4: abortSignal yang sudah aborted → throw SEBELUM dispatch (tanpa task baru).
 *
 *   bun run scripts/smoke-deep-task.ts
 */
import { createBackgroundTask } from "@mastra/core/background-tasks";
import { mastra } from "../src/mastra";
import { AQSHA_AGENT_KIND_KEY } from "../src/mastra/lib/tool-context";
import { DEEP_TASK_TOOL_NAME, runDeepSubagentTask } from "../src/mastra/workflows/deep-tasks";

const KATA_ARGS = (kata: string) => ({
  agentId: "deep-writer" as const,
  prompt: `Balas persis satu kata: ${kata}`,
  requestContext: [[AQSHA_AGENT_KIND_KEY, "lite"]] as [string, unknown][],
  toolChoice: "none" as const,
});

async function main() {
  // Paritas server production: deployer memanggil `startWorkers()` saat boot — tanpa ini event
  // workflow evented (engine task) tak diproses dan task menggantung `running` selamanya.
  await mastra.startWorkers();
  const manager = mastra.backgroundTaskManager;
  if (!manager) throw new Error("backgroundTaskManager tidak aktif — cek konfigurasi Mastra");

  // ── Skenario 1: dispatch baru + reuse by toolCallId base ─────────────────────────────────
  const runId = `smoke-deep-task-${Date.now()}`;
  const base = {
    mastra,
    runId,
    threadId: `smoke-thread-${Date.now()}`,
    timeoutMs: 120_000,
    toolCallId: `${runId}:synthesize`,
    args: KATA_ARGS("siap"),
  };

  const t0 = Date.now();
  const first = await runDeepSubagentTask(base);
  const firstMs = Date.now() - t0;
  console.log("[smoke] first:", JSON.stringify(first.text.slice(0, 60)), `${firstMs}ms`);

  const t1 = Date.now();
  const second = await runDeepSubagentTask(base);
  const secondMs = Date.now() - t1;
  console.log("[smoke] second (reuse):", JSON.stringify(second.text.slice(0, 60)), `${secondMs}ms`);

  const { tasks } = await manager.listTasks({ runId });
  console.log(
    "[smoke] tasks:",
    JSON.stringify(tasks.map((t) => ({ status: t.status, toolCallId: t.toolCallId }))),
  );

  const ok1 =
    first.text.trim().length > 0 &&
    second.text === first.text &&
    secondMs < Math.max(2000, firstMs / 4) &&
    tasks.length === 1 &&
    tasks[0]?.status === "completed";
  console.log(ok1 ? "[smoke] skenario 1 PASS" : "[smoke] skenario 1 FAIL");

  // ── Skenario 2 (B5): attempt ber-suffix completed ter-reuse oleh lookup base ─────────────
  // Seed: task SUFFIX `:r1:<ts>` (persis format attempt retry) dijalankan sampai completed,
  // lalu panggil runDeepSubagentTask dgn toolCallId BASE → wajib reuse (tanpa dispatch baru).
  const runId2 = `smoke-deep-b5-${Date.now()}`;
  const base2 = `${runId2}:synthesize`;
  const seedHandle = createBackgroundTask(manager, {
    runId: runId2,
    toolName: DEEP_TASK_TOOL_NAME,
    toolCallId: `${base2}:r1:${Date.now()}`,
    args: KATA_ARGS("pulih") as unknown as Record<string, unknown>,
    agentId: "deep-writer",
    threadId: `smoke-thread-b5-${Date.now()}`,
    timeoutMs: 120_000,
    context: {
      executor: { execute: () => Promise.resolve({ text: "pulih" }) },
    },
  });
  await seedHandle.dispatch();
  const seeded = await seedHandle.waitForCompletion({ timeoutMs: 30_000 });
  const t2 = Date.now();
  const reused = await runDeepSubagentTask({
    mastra,
    runId: runId2,
    threadId: `smoke-thread-b5-${Date.now()}`,
    timeoutMs: 120_000,
    toolCallId: base2,
    args: KATA_ARGS("pulih"),
  });
  const reusedMs = Date.now() - t2;
  const { tasks: tasks2 } = await manager.listTasks({ runId: runId2 });
  console.log(
    "[smoke] b5 reuse:",
    JSON.stringify(reused.text.slice(0, 60)),
    `${reusedMs}ms`,
    JSON.stringify(tasks2.map((t) => ({ status: t.status, toolCallId: t.toolCallId }))),
  );
  const ok2 =
    seeded.status === "completed" &&
    reused.text === "pulih" &&
    reusedMs < 2000 &&
    tasks2.length === 1; // TIDAK lahir task base baru — inti fix B5
  console.log(ok2 ? "[smoke] skenario 2 (B5) PASS" : "[smoke] skenario 2 (B5) FAIL");

  // ── Skenario 3 (B4): abortSignal sudah aborted → throw sebelum dispatch ──────────────────
  const runId3 = `smoke-deep-b4-${Date.now()}`;
  const aborted = new AbortController();
  aborted.abort();
  let threw = false;
  try {
    await runDeepSubagentTask({
      mastra,
      runId: runId3,
      threadId: `smoke-thread-b4-${Date.now()}`,
      timeoutMs: 120_000,
      toolCallId: `${runId3}:synthesize`,
      args: KATA_ARGS("batal"),
      abortSignal: aborted.signal,
    });
  } catch {
    threw = true;
  }
  const { tasks: tasks3 } = await manager.listTasks({ runId: runId3 });
  const ok3 = threw && tasks3.length === 0; // tak ada task lahir untuk run yang dibatalkan
  console.log(ok3 ? "[smoke] skenario 3 (B4) PASS" : "[smoke] skenario 3 (B4) FAIL");

  const ok = ok1 && ok2 && ok3;
  console.log(ok ? "[smoke] PASS" : "[smoke] FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] FAILED", err);
  process.exit(1);
});
