/**
 * Smoke test DUR-7 — subagent `/deep` sebagai background task persisten (`runDeepSubagentTask`):
 * (1) dispatch task baru → executor jalan → hasil terpersist; (2) pemanggilan ULANG dengan
 * `toolCallId` sama me-REUSE hasil dari storage (cepat, tanpa model call kedua) — properti yang
 * membuat `run.restart()` (DUR-5) tidak re-debit search.
 *
 *   bun run scripts/smoke-deep-task.ts
 */
import { mastra } from "../src/mastra";
import { AQSHA_AGENT_KIND_KEY } from "../src/mastra/lib/tool-context";
import { runDeepSubagentTask } from "../src/mastra/workflows/deep-tasks";

async function main() {
  // Paritas server production: deployer memanggil `startWorkers()` saat boot — tanpa ini event
  // workflow evented (engine task) tak diproses dan task menggantung `running` selamanya.
  await mastra.startWorkers();
  const manager = mastra.backgroundTaskManager;
  if (!manager) throw new Error("backgroundTaskManager tidak aktif — cek konfigurasi Mastra");
  const runId = `smoke-deep-task-${Date.now()}`;
  const base = {
    mastra,
    runId,
    threadId: `smoke-thread-${Date.now()}`,
    timeoutMs: 120_000,
    toolCallId: `${runId}:synthesize`,
    args: {
      agentId: "deep-writer" as const,
      prompt: "Balas persis satu kata: siap",
      requestContext: [[AQSHA_AGENT_KIND_KEY, "lite"]] as [string, unknown][],
      toolChoice: "none" as const,
    },
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

  const ok =
    first.text.trim().length > 0 &&
    second.text === first.text &&
    secondMs < Math.max(2000, firstMs / 4) &&
    tasks.length === 1 &&
    tasks[0]?.status === "completed";
  console.log(ok ? "[smoke] PASS" : "[smoke] FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] FAILED", err);
  process.exit(1);
});
