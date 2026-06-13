/**
 * Phase 0 live spike harness (plan §9.4 Step 0).
 *
 * Drives the real Claude Agent SDK through the production RunManager with the
 * in-memory store — no Convex, no HTTP. Each scenario prints a compact result
 * block (status, latency, cost, turns, session) so runs can be compared for
 * the D6 benchmark.
 *
 * Usage (from apps/agents/, so Bun picks up .env):
 *   bun scripts/spike.ts chat [lite|pro] [prompt...]
 *   bun scripts/spike.ts resume [lite|pro]
 *   bun scripts/spike.ts holdwindow <approve|deny|timeout>
 *   bun scripts/spike.ts askuser
 *   bun scripts/spike.ts skill-auto
 *   bun scripts/spike.ts command          # /verify-citations as a slash command
 *   bun scripts/spike.ts deep [lite|pro]
 *   bun scripts/spike.ts init             # dump system/init (slash_commands)
 */
import { randomUUID } from "node:crypto";
import type { RunRequest } from "@aqsha/agent-contracts";
import { loadConfig } from "../src/config";
import { RunManager, type QueryRunner } from "../src/runs/runManager";
import { sdkQueryRunner } from "../src/runs/sdkRunner";
import { MemoryStore } from "../src/store/memoryStore";

const config = loadConfig();
if (!config.anthropicApiKey && !config.anthropicAuthToken) {
  console.error(
    "Missing Anthropic credentials — set ANTHROPIC_API_KEY, or for a gateway " +
      "set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN, in apps/agents/.env.",
  );
  process.exit(1);
}

const store = new MemoryStore();

// Tee runner: forward the SDK stream untouched, but record message types (and
// the system/init payload) for spike visibility.
const seenMessageTypes = new Map<string, number>();
let initMessage: Record<string, unknown> | undefined;
const teeRunner: QueryRunner = ({ prompt, options }) => {
  const handle = sdkQueryRunner({ prompt, options });
  const stream = (async function* () {
    for await (const message of handle.stream) {
      const m = message as unknown as Record<string, unknown>;
      const key = `${String(m.type)}${m.subtype ? `/${String(m.subtype)}` : ""}`;
      seenMessageTypes.set(key, (seenMessageTypes.get(key) ?? 0) + 1);
      if (m.type === "system" && m.subtype === "init" && !initMessage) {
        initMessage = m;
      }
      yield message;
    }
  })();
  return { stream, interrupt: handle.interrupt };
};

const manager = new RunManager({ store, config, runner: teeRunner });

function request(input: {
  threadId?: string;
  agentKind?: "lite" | "pro";
  prompt: string;
}): RunRequest {
  return {
    runId: `run_${randomUUID()}`,
    threadId: input.threadId ?? `thr_${randomUUID()}`,
    ownerUserId: "spike-user",
    agentKind: input.agentKind ?? "lite",
    mode: "normal",
    prompt: input.prompt,
    contextRefs: { artifactIds: [], workspaceIds: [] },
  };
}

async function waitForRun(
  runId: string,
  doneStatuses: string[],
  timeoutMs = 300_000,
): Promise<string> {
  const start = Date.now();
  for (;;) {
    const run = await store.getRun(runId);
    if (run && doneStatuses.includes(run.status)) {
      return run.status;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout waiting for run ${runId} (last=${run?.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function waitForPendingInteraction(threadId: string, timeoutMs = 240_000) {
  const start = Date.now();
  for (;;) {
    const rows = await store.listInteractions(threadId);
    const pending = rows.find((row) => row.status === "pending");
    if (pending) {
      return pending;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout waiting for pending interaction");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function report(label: string, runId: string, startedAt: number) {
  const run = await store.getRun(runId);
  const events = await store.listRunEvents(runId);
  const thread = run ? await store.getThread(run.threadId) : null;
  const messages = run ? await store.listMessages(run.threadId, 50) : [];
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  console.log(`\n=== ${label} ===`);
  console.log({
    status: run?.status,
    elapsedMs: Date.now() - startedAt,
    costUsd: run?.costUsd,
    usage: run?.usageJson ? JSON.parse(run.usageJson) : undefined,
    numTurns: run?.numTurns,
    sessionId: run?.sdkSessionId ?? thread?.sdkSessionId,
    error: run?.errorMessage,
  });
  console.log("events:", events.map((event) => event.type).join(", "));
  console.log("assistant >>>");
  console.log(lastAssistant?.text ?? "(no assistant text)");
  console.log("message types:", Object.fromEntries(seenMessageTypes));
}

async function runToCompletion(label: string, req: RunRequest) {
  const startedAt = Date.now();
  await manager.startRun(req);
  await waitForRun(req.runId, ["completed", "failed", "canceled", "waiting_hitl"]);
  await report(label, req.runId, startedAt);
  return store.getRun(req.runId);
}

const [scenario = "chat", ...rest] = process.argv.slice(2);

async function main() {
  switch (scenario) {
    case "chat": {
      const agentKind = (rest[0] === "pro" ? "pro" : "lite") as "lite" | "pro";
      const prompt =
        rest.slice(1).join(" ") ||
        "Jelaskan singkat (maks 5 kalimat) perbedaan reliabilitas dan validitas dalam penelitian kuantitatif.";
      await runToCompletion(`chat/${agentKind}`, request({ agentKind, prompt }));
      break;
    }

    case "resume": {
      const agentKind = (rest[0] === "pro" ? "pro" : "lite") as "lite" | "pro";
      const threadId = `thr_${randomUUID()}`;
      await runToCompletion(
        "resume/turn-1",
        request({
          threadId,
          agentKind,
          prompt:
            "Nama saya Vito dan saya meneliti efek gamifikasi pada motivasi belajar. Ingat itu. Balas satu kalimat saja.",
        }),
      );
      const thread = await store.getThread(threadId);
      console.log("\nsession after turn 1:", thread?.sdkSessionId);
      await runToCompletion(
        "resume/turn-2 (expects session resume — no history rebuild)",
        request({
          threadId,
          agentKind,
          prompt: "Siapa nama saya dan apa topik penelitian saya? Jawab singkat.",
        }),
      );
      break;
    }

    case "holdwindow": {
      const action = rest[0] ?? "approve";
      const threadId = `thr_${randomUUID()}`;
      const req = request({
        threadId,
        agentKind: "lite",
        prompt:
          "Buat workspace baru bernama 'Spike Test' memakai tool createWorkspace. Jangan bertanya, langsung panggil tool-nya.",
      });
      const startedAt = Date.now();
      await manager.startRun(req);
      const pending = await waitForPendingInteraction(threadId);
      console.log(
        `pending interaction after ${Date.now() - startedAt}ms:`,
        pending.toolName,
        pending.type,
      );
      if (action === "approve" || action === "deny") {
        // Fast response → should resolve in-place (no waiting_hitl).
        await store.respondInteraction(pending.id, {
          kind: "approval",
          approved: action === "approve",
          note: action === "deny" ? "spike deny" : undefined,
        });
      } else {
        console.log(
          `letting the hold window (${config.holdWindowMs}ms) elapse…`,
        );
        await waitForRun(req.runId, ["waiting_hitl"], config.holdWindowMs + 60_000);
        console.log("run interrupted → waiting_hitl; responding now (approve)…");
        await store.respondInteraction(pending.id, {
          kind: "approval",
          approved: true,
        });
        const resumed = await manager.resumeRun(req.runId, pending.id);
        console.log("resume:", resumed);
      }
      await waitForRun(req.runId, ["completed", "failed", "canceled"]);
      await report(`holdwindow/${action}`, req.runId, startedAt);
      break;
    }

    case "askuser": {
      const threadId = `thr_${randomUUID()}`;
      const req = request({
        threadId,
        agentKind: "lite",
        prompt:
          "Saya mau menulis proposal penelitian, tapi kamu harus tahu dulu jenjang studi saya (S1/S2/S3). Pakai tool askUser untuk menanyakannya — jangan menebak.",
      });
      const startedAt = Date.now();
      await manager.startRun(req);
      const pending = await waitForPendingInteraction(threadId);
      console.log("askUser interaction:", JSON.stringify(pending.payload, null, 2));
      await waitForRun(req.runId, ["waiting_hitl"]);
      await store.respondInteraction(pending.id, {
        kind: "answers",
        answers: [
          {
            questionId: "q0",
            prompt: "jenjang studi",
            customAnswer: "S2 magister pendidikan",
          },
        ],
      });
      const resumed = await manager.resumeRun(req.runId, pending.id);
      console.log("resume:", resumed);
      // Give the resumed turn a beat to flip waiting_hitl → running.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await waitForRun(req.runId, ["completed", "failed"]);
      await report("askuser", req.runId, startedAt);
      break;
    }

    case "skill-auto": {
      // No slash command: the description-based progressive disclosure should
      // pull in the verify-citations skill on its own.
      await runToCompletion(
        "skill-auto",
        request({
          agentKind: "pro",
          prompt:
            "Tolong periksa apakah daftar pustaka berikut valid dan tidak difabrikasi:\n" +
            '1. Smith, J. (2021). "Deep Learning for Education." Journal of EdTech, 12(3). doi:10.1234/fake.2021.001\n' +
            "2. Vaswani, A. et al. (2017). Attention Is All You Need. arXiv:1706.03762",
        }),
      );
      break;
    }

    case "command": {
      await runToCompletion(
        "command//verify-citations",
        request({
          agentKind: "pro",
          prompt:
            "/verify-citations 1. Vaswani, A. et al. (2017). Attention Is All You Need. arXiv:1706.03762\n2. Smith, J. (2021). Deep Learning for Education. Journal of EdTech. doi:10.1234/fake.2021.001",
        }),
      );
      break;
    }

    case "deep": {
      const agentKind = (rest[0] === "pro" ? "pro" : "lite") as "lite" | "pro";
      await runToCompletion(
        `deep/${agentKind}`,
        request({
          agentKind,
          prompt:
            "/deep Apakah gamifikasi meningkatkan motivasi belajar siswa sekolah menengah? Maksimal 2 sub-pertanyaan, ringkas.",
        }),
      );
      break;
    }

    case "init": {
      await runToCompletion(
        "init",
        request({ agentKind: "lite", prompt: "Balas dengan satu kata: halo." }),
      );
      const init = initMessage as
        | { slash_commands?: string[]; tools?: string[]; model?: string }
        | undefined;
      console.log("\nsystem/init slash_commands:", init?.slash_commands);
      console.log("system/init model:", init?.model);
      console.log(
        "system/init aqsha tools:",
        init?.tools?.filter((tool) => tool.startsWith("mcp__aqsha__")),
      );
      break;
    }

    default:
      console.error(`unknown scenario: ${scenario}`);
      process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
