import { describe, expect, it } from "vitest";
import type { RunRequest } from "@aqsha/agent-contracts";
import type { BridgeMessage } from "../src/agent/streamBridge";
import { loadConfig } from "../src/config";
import { RunManager, type QueryHandle, type QueryRunner } from "../src/runs/runManager";
import { MemoryStore } from "../src/store/memoryStore";

const config = loadConfig({
  AGENTS_HOLD_WINDOW_MS: "40",
  AGENTS_STREAM_FLUSH_MS: "1",
  AGENTS_STREAM_FLUSH_CHARS: "1",
});

function request(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    runId: "run1",
    threadId: "t1",
    ownerUserId: "u1",
    agentKind: "lite",
    mode: "normal",
    prompt: "Halo Astra",
    contextRefs: { artifactIds: [], workspaceIds: [] },
    ...overrides,
  };
}

async function waitFor<T>(
  probe: () => Promise<T | null | undefined | false>,
  timeoutMs = 2_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("waitFor timed out");
}

function streamOf(messages: BridgeMessage[]): QueryHandle {
  return {
    stream: (async function* () {
      for (const message of messages) {
        yield message;
      }
    })(),
    interrupt: async () => {},
  };
}

const COMPLETED_MESSAGES: BridgeMessage[] = [
  { type: "system", subtype: "init", session_id: "sess_1" },
  { type: "assistant", message: { content: [{ type: "text", text: "Halo! Ada yang bisa dibantu?" }] } },
  {
    type: "result",
    subtype: "success",
    session_id: "sess_1",
    total_cost_usd: 0.01,
    num_turns: 1,
    usage: { input_tokens: 10, output_tokens: 5 },
    result: "ok",
  },
];

describe("RunManager", () => {
  it("runs a normal chat turn to completion and persists session + cost", async () => {
    const store = new MemoryStore();
    const seenPrompts: string[] = [];
    const runner: QueryRunner = ({ prompt }) => {
      seenPrompts.push(prompt);
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request());

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(run.costUsd).toBeCloseTo(0.01);
    expect(run.sdkSessionId).toBe("sess_1");
    expect(seenPrompts[0]).toContain("Halo Astra");

    const thread = await store.getThread("t1");
    expect(thread?.status).toBe("idle");
    expect(thread?.sdkSessionId).toBe("sess_1");

    const messages = await store.listMessages("t1", 10);
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.status).toBe("complete");
    expect(assistant?.text).toContain("Halo!");
    // User prompt message was recorded (no promptMessageId provided).
    expect(messages.find((m) => m.role === "user")?.text).toBe("Halo Astra");
  });

  it("marks the run failed when the stream errors", async () => {
    const store = new MemoryStore();
    const runner: QueryRunner = () => ({
      stream: (async function* (): AsyncGenerator<BridgeMessage> {
        yield { type: "system", subtype: "init", session_id: "sess_x" };
        throw new Error("provider exploded");
      })(),
      interrupt: async () => {},
    });
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request());

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "failed" ? row : null;
    });
    expect(run.errorMessage).toContain("provider exploded");
    expect((await store.getThread("t1"))?.status).toBe("failed");
  });

  it("pauses to waiting_hitl on askUser and resumes to completion after the answer", async () => {
    const store = new MemoryStore();
    let call = 0;
    let managerRef: RunManager | null = null;
    const runner: QueryRunner = ({ prompt }) => {
      call += 1;
      if (call === 1) {
        // First turn: the model asks the user (tool handler → broker), then
        // the stream ends due to interrupt.
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            yield { type: "system", subtype: "init", session_id: "sess_a" };
            await managerRef!.broker.requestAskUser({
              runId: "run1",
              threadId: "t1",
              ownerUserId: "u1",
              questions: [
                {
                  prompt: "Fokus?",
                  options: [
                    { id: "a", label: "A" },
                    { id: "b", label: "B" },
                  ],
                },
              ],
            });
          })(),
          interrupt: async () => {},
        };
      }
      // Resume turn: answers are injected as the continuation prompt.
      expect(prompt).toContain("user answered");
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    managerRef = manager;
    await manager.startRun(request());

    const waiting = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "waiting_hitl" ? row : null;
    });
    expect(waiting.sdkSessionId).toBe("sess_a");

    const interaction = (await store.listInteractions("t1"))[0]!;
    await store.respondInteraction(interaction.id, {
      kind: "answers",
      answers: [{ prompt: "Fokus?", selectedOptionIds: ["a"] }],
    });
    const resumed = await manager.resumeRun("run1", interaction.id);
    expect(resumed.ok).toBe(true);

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(call).toBe(2);
  });

  it("cancels an in-flight run", async () => {
    const store = new MemoryStore();
    let release: (() => void) | null = null;
    const runner: QueryRunner = () => {
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        stream: (async function* (): AsyncGenerator<BridgeMessage> {
          yield { type: "system", subtype: "init", session_id: "sess_c" };
          await gate; // hangs until interrupted
        })(),
        interrupt: async () => {
          release?.();
        },
      };
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request());

    await waitFor(async () => (manager.isActive("run1") ? true : null));
    const result = await manager.cancelRun("run1");
    expect(result.ok).toBe(true);

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "canceled" ? row : null;
    });
    expect(run.status).toBe("canceled");

    // Cancel emits an explicit terminal event so the timeline shows "Dihentikan"
    // even via the event stream (not only the run row).
    const canceledEvents = (await store.listRunEvents("run1")).filter(
      (eventRow) =>
        eventRow.type === "run_status" &&
        JSON.parse(eventRow.payloadJson).status === "canceled",
    );
    expect(canceledEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("intercepts /deep: runs the durable five-phase orchestration", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    const runner: QueryRunner = ({ prompt, options }) => {
      const index = calls.length;
      calls.push({ prompt, options });
      return streamOf([
        { type: "system", subtype: "init", session_id: `sess_p${index}` },
        {
          type: "assistant",
          message: { content: [{ type: "text", text: `output fase ${index}` }] },
        },
        {
          type: "result",
          subtype: "success",
          session_id: `sess_p${index}`,
          total_cost_usd: 0.1,
          num_turns: 2,
        },
      ]);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(
      request({ prompt: "/deep dampak LLM pada pendidikan tinggi" }),
    );

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(run.mode).toBe("deep");
    expect(calls).toHaveLength(5);
    // Phase 1 (plan): question included, no subagents, tight turn budget.
    expect(calls[0]!.prompt).toContain("dampak LLM");
    expect(calls[0]!.prompt).not.toContain("/deep");
    expect(calls[0]!.options.maxTurns).toBe(4);
    expect(calls[0]!.options.agents).toBeUndefined();
    // Phase 2 (literature): prior plan output injected + parallel subagents.
    expect(calls[1]!.prompt).toContain("output fase 0");
    expect(Object.keys(calls[1]!.options.agents as object)).toEqual([
      "literature-searcher",
    ]);
    expect(calls[1]!.options.allowedTools).toContain("Agent");
    // Write phase consumes the whole evidence chain.
    expect(calls[4]!.prompt).toContain("output fase 1");
    expect(calls[4]!.prompt).toContain("output fase 3");

    // All five phases persisted done; cost summed onto the run.
    const phases = await store.listResearchPhases("run1");
    expect(phases.map((p) => p.status)).toEqual(["done", "done", "done", "done", "done"]);
    expect(run.costUsd).toBeCloseTo(0.5);

    // Only the write phase's text is chat text.
    const messages = await store.listMessages("t1", 10);
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.text).toBe("output fase 4");
  });

  it("re-dispatched deep run replays only the missing phases", async () => {
    const store = new MemoryStore();
    await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
    await store.createRun({
      runId: "run1",
      threadId: "t1",
      ownerUserId: "u1",
      agentKind: "lite",
      mode: "deep",
    });
    await store.upsertResearchPhase({
      runId: "run1",
      phase: "plan",
      status: "done",
      output: "rencana tersimpan",
    });
    await store.upsertResearchPhase({
      runId: "run1",
      phase: "literature",
      status: "done",
      output: "bukti tersimpan",
    });

    const calls: Array<{ prompt: string }> = [];
    const runner: QueryRunner = ({ prompt }) => {
      calls.push({ prompt });
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    // counter_evidence, citation_verify, write — plan & literature skipped.
    expect(calls).toHaveLength(3);
    expect(calls[0]!.prompt).toContain("COUNTER-EVIDENCE");
    expect(calls[0]!.prompt).toContain("bukti tersimpan");
  });

  it("treats a max-turns stop with usable text as a done-partial phase", async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const runner: QueryRunner = ({ prompt }) => {
      const index = calls.length;
      calls.push(prompt);
      if (index === 2) {
        // counter_evidence phase: emits text, then the SDK throws max-turns.
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            yield { type: "system", subtype: "init", session_id: "sess_ce" };
            yield {
              type: "assistant",
              message: {
                content: [{ type: "text", text: "temuan kontra parsial" }],
              },
            };
            throw new Error(
              "Claude Code returned an error result: Reached maximum number of turns (10)",
            );
          })(),
          interrupt: async () => {},
        };
      }
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(run.status).toBe("completed");
    expect(calls).toHaveLength(5);
    const phases = await store.listResearchPhases("run1");
    const counter = phases.find((p) => p.phase === "counter_evidence");
    expect(counter?.status).toBe("done");
    expect(counter?.output).toContain("temuan kontra parsial");
  });

  it("optional phase that exhausts turns with NO text degrades to done with a caveat", async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const runner: QueryRunner = ({ prompt }) => {
      const index = calls.length;
      calls.push(prompt);
      if (index === 3) {
        // citation_verify: burns every turn on tool calls, no text, then throws.
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            yield { type: "system", subtype: "init", session_id: "sess_cv" };
            throw new Error(
              "Claude Code returned an error result: Reached maximum number of turns (12)",
            );
          })(),
          interrupt: async () => {},
        };
      }
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(calls).toHaveLength(5);
    const phases = await store.listResearchPhases("run1");
    const cv = phases.find((p) => p.phase === "citation_verify");
    expect(cv?.status).toBe("done");
    expect(cv?.output).toContain("budget turn habis");
  });

  it("stops a deep dispatch when the per-dispatch cost budget is exhausted", async () => {
    const store = new MemoryStore();
    const tightConfig = loadConfig({
      AGENTS_HOLD_WINDOW_MS: "40",
      AGENTS_STREAM_FLUSH_MS: "1",
      AGENTS_STREAM_FLUSH_CHARS: "1",
      ASTRA_MAX_RUN_BUDGET_USD: "0.15",
    });
    const calls: string[] = [];
    const runner: QueryRunner = ({ prompt }) => {
      calls.push(prompt);
      return streamOf([
        { type: "system", subtype: "init", session_id: "sess_b" },
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "keluaran" }] },
        },
        { type: "result", subtype: "success", total_cost_usd: 0.1 },
      ]);
    };
    const manager = new RunManager({ store, config: tightConfig, runner });
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "failed" ? row : null;
    });
    // Two phases ran (0.1 + 0.1 ≥ 0.15) before the guard tripped.
    expect(calls).toHaveLength(2);
    expect(run.errorMessage).toContain("budget");
    // Completed phases survive: a retry continues instead of starting over.
    const phases = await store.listResearchPhases("run1");
    expect(phases.filter((p) => p.status === "done")).toHaveLength(2);
  });

  it("deep write-phase HITL interrupt parks the run and resumes that phase's session", async () => {
    const store = new MemoryStore();
    let managerRef: RunManager | null = null;
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    const runner: QueryRunner = ({ prompt, options }) => {
      const index = calls.length;
      calls.push({ prompt, options });
      if (index === 4) {
        // Write phase: model asks the user → interrupt.
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            yield { type: "system", subtype: "init", session_id: "sess_write" };
            await managerRef!.broker.requestAskUser({
              runId: "run1",
              threadId: "t1",
              ownerUserId: "u1",
              questions: [
                {
                  prompt: "Gaya sitasi?",
                  options: [
                    { id: "apa", label: "APA 7" },
                    { id: "ieee", label: "IEEE" },
                  ],
                },
              ],
            });
          })(),
          interrupt: async () => {},
        };
      }
      return streamOf([
        { type: "system", subtype: "init", session_id: `sess_p${index}` },
        {
          type: "assistant",
          message: { content: [{ type: "text", text: `output fase ${index}` }] },
        },
        { type: "result", subtype: "success", session_id: `sess_p${index}` },
      ]);
    };
    const manager = new RunManager({ store, config, runner });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "waiting_hitl" ? row : null;
    });
    const phases = await store.listResearchPhases("run1");
    const write = phases.find((p) => p.phase === "write");
    expect(write?.status).toBe("running");
    expect(write?.sdkSessionId).toBe("sess_write");

    const interaction = (await store.listInteractions("t1"))[0]!;
    await store.respondInteraction(interaction.id, {
      kind: "answers",
      answers: [{ prompt: "Gaya sitasi?", selectedOptionIds: ["apa"] }],
    });
    const resumed = await manager.resumeRun("run1", interaction.id);
    expect(resumed.ok).toBe(true);

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    // 5 initial phases + 1 resume call, resuming the write phase's session.
    expect(calls).toHaveLength(6);
    expect(calls[5]!.prompt).toContain("user answered");
    expect(calls[5]!.options.resume).toBe("sess_write");
  });

  it("forwards other slash commands verbatim to the SDK", async () => {
    const store = new MemoryStore();
    let capturedPrompt = "";
    const runner: QueryRunner = ({ prompt }) => {
      capturedPrompt = prompt;
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request({ prompt: "/verify-citations artifact a1" }));
    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(capturedPrompt).toBe("/verify-citations artifact a1");
  });
});
