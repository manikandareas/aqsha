import { describe, expect, it } from "vitest";
import type { RunRequest } from "@aqsha/agent-contracts";
import type { BridgeMessage } from "../src/agent/streamBridge";
import { loadConfig } from "../src/config";
import { RunManager, type QueryHandle, type QueryRunner } from "../src/runs/runManager";
import { MemoryStore } from "../src/store/memoryStore";

const config = loadConfig({
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

// ── deep-research plan-gate test helpers ────────────────────────────────────
// A /deep run now PARKS after the plan phase (proposeResearchPlan gate). The
// runner below makes the plan phase submit the gated tool (→ interrupt), and
// every other phase emit `output fase <callIndex>`.

function phaseMessages(index: number, costUsd = 0.1): BridgeMessage[] {
  return [
    { type: "system", subtype: "init", session_id: `sess_p${index}` },
    {
      type: "assistant",
      message: { content: [{ type: "text", text: `output fase ${index}` }] },
    },
    {
      type: "result",
      subtype: "success",
      session_id: `sess_p${index}`,
      total_cost_usd: costUsd,
      num_turns: 2,
    },
  ];
}

/** True for a plan-phase prompt (initial PHASE 1/5 or a revise re-plan). */
function isPlanPrompt(prompt: string): boolean {
  return prompt.includes("PHASE 1/5") || prompt.includes("Revise the sub-questions");
}

function gatingDeepRunner(input: {
  managerRef: () => RunManager;
  calls: Array<{ prompt: string; options: Record<string, unknown> }>;
  /** Override a specific call (by index); array → streamOf, handle → as-is. */
  override?: (index: number) => QueryHandle | BridgeMessage[] | undefined;
  planPayload?: Record<string, unknown>;
  /** When false, the plan phase parks WITHOUT a system/init session_id. */
  planEmitsInit?: boolean;
}): QueryRunner {
  return ({ prompt, options }) => {
    const index = input.calls.length;
    input.calls.push({ prompt, options });
    const overridden = input.override?.(index);
    if (overridden) {
      return Array.isArray(overridden) ? streamOf(overridden) : overridden;
    }
    if (isPlanPrompt(prompt)) {
      // The model submits the plan via proposeResearchPlan; the gate (canUseTool
      // → requestApproval) interrupts the run for plan review.
      const emitInit = input.planEmitsInit !== false;
      return {
        stream: (async function* (): AsyncGenerator<BridgeMessage> {
          if (emitInit) {
            yield { type: "system", subtype: "init", session_id: `sess_p${index}` };
          }
          await input.managerRef().broker.requestApproval({
            runId: "run1",
            threadId: "t1",
            ownerUserId: "u1",
            toolName: "proposeResearchPlan",
            payload: input.planPayload ?? {
              title: "Rencana",
              summary: "ringkas",
              questions: ["q1", "q2", "q3"],
            },
          });
        })(),
        interrupt: async () => {},
      };
    }
    return streamOf(phaseMessages(index));
  };
}

/** Wait for the parked plan gate, respond, and resume. */
async function passPlanGate(
  manager: RunManager,
  store: MemoryStore,
  decision: {
    decision: "start" | "revise" | "reject";
    editedPlan?: string;
    revisionInstruction?: string;
  } = { decision: "start" },
): Promise<string> {
  await waitFor(async () => {
    const row = await store.getRun("run1");
    return row?.status === "waiting_hitl" ? row : null;
  });
  const card = (await store.listPendingInteractionsByRun("run1")).find(
    (interaction) => interaction.toolName === "proposeResearchPlan",
  );
  if (!card) {
    throw new Error("no pending proposeResearchPlan card");
  }
  await store.respondInteraction(card.id, { kind: "plan_decision", ...decision });
  await manager.resumeRun("run1", card.id);
  return card.id;
}

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

  it("intercepts /deep: plan gate parks, then runs the durable phases on start", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({ managerRef: () => managerRef!, calls }),
    });
    managerRef = manager;
    await manager.startRun(
      request({ prompt: "/deep dampak LLM pada pendidikan tinggi" }),
    );

    // Plan phase submits proposeResearchPlan → the run parks for review BEFORE
    // any literature search runs.
    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "waiting_hitl" ? row : null;
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain("dampak LLM");
    expect(calls[0]!.prompt).not.toContain("/deep");
    expect(calls[0]!.options.maxTurns).toBe(4);
    expect(calls[0]!.options.agents).toBeUndefined();

    await passPlanGate(manager, store, { decision: "start" });

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(run.mode).toBe("deep");
    expect(calls).toHaveLength(5);
    // Phase 2 (literature): the APPROVED plan (rendered markdown) is injected —
    // not a phantom plan-phase chat output — plus parallel subagents.
    expect(calls[1]!.prompt).toContain("q1");
    expect(calls[1]!.prompt).toContain("Rencana");
    expect(Object.keys(calls[1]!.options.agents as object)).toEqual([
      "literature-searcher",
    ]);
    expect(calls[1]!.options.allowedTools).toContain("Agent");
    // Phase 3 & 4 each delegate to their OWN dedicated subagent (no leakage of
    // the literature searcher across phase boundaries).
    expect(Object.keys(calls[2]!.options.agents as object)).toEqual(["counter-evidence"]);
    expect(Object.keys(calls[3]!.options.agents as object)).toEqual(["citation-verifier"]);
    // Write phase consumes the whole evidence chain.
    expect(calls[4]!.prompt).toContain("output fase 1");
    expect(calls[4]!.prompt).toContain("output fase 3");

    // All five phases persisted done.
    const phases = await store.listResearchPhases("run1");
    expect(phases.map((p) => p.status)).toEqual(["done", "done", "done", "done", "done"]);

    // The write phase's text is the final chat text (the empty plan-gate bubble
    // precedes it, so take the LAST assistant message).
    const assistant = (await store.listMessages("t1", 10))
      .filter((m) => m.role === "assistant")
      .at(-1);
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

    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    const runner: QueryRunner = ({ prompt, options }) => {
      calls.push({ prompt, options });
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
    expect(calls[1]!.prompt).toContain("CITATION VERIFICATION");
    // Lock the per-phase wiring: a flat-map regression would leak the wrong
    // subagent (or the literature searcher) into these phases.
    expect(Object.keys(calls[0]!.options.agents as object)).toEqual(["counter-evidence"]);
    expect(Object.keys(calls[1]!.options.agents as object)).toEqual(["citation-verifier"]);
    expect(calls[2]!.options.agents).toBeUndefined();
  });

  it("treats a max-turns stop with usable text as a done-partial phase", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({
        managerRef: () => managerRef!,
        calls,
        override: (index) =>
          // counter_evidence (call 2): emits text, then the SDK throws max-turns.
          index === 2
            ? {
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
              }
            : undefined,
      }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    await passPlanGate(manager, store, { decision: "start" });

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(run.status).toBe("completed");
    expect(calls).toHaveLength(5);
    expect(Object.keys(calls[2]!.options.agents as object)).toEqual(["counter-evidence"]);
    const phases = await store.listResearchPhases("run1");
    const counter = phases.find((p) => p.phase === "counter_evidence");
    expect(counter?.status).toBe("done");
    expect(counter?.output).toContain("temuan kontra parsial");
  });

  it("optional phase that exhausts turns with NO text degrades to done with a caveat", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({
        managerRef: () => managerRef!,
        calls,
        override: (index) =>
          // citation_verify (call 3): burns every turn on tool calls, no text.
          index === 3
            ? {
                stream: (async function* (): AsyncGenerator<BridgeMessage> {
                  yield { type: "system", subtype: "init", session_id: "sess_cv" };
                  throw new Error(
                    "Claude Code returned an error result: Reached maximum number of turns (12)",
                  );
                })(),
                interrupt: async () => {},
              }
            : undefined,
      }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    await passPlanGate(manager, store, { decision: "start" });

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(calls).toHaveLength(5);
    expect(Object.keys(calls[3]!.options.agents as object)).toEqual(["citation-verifier"]);
    const phases = await store.listResearchPhases("run1");
    const cv = phases.find((p) => p.phase === "citation_verify");
    expect(cv?.status).toBe("done");
    expect(cv?.output).toContain("budget turn habis");
  });

  it("stops a deep dispatch when the per-dispatch cost budget is exhausted", async () => {
    const store = new MemoryStore();
    const tightConfig = loadConfig({
      AGENTS_STREAM_FLUSH_MS: "1",
      AGENTS_STREAM_FLUSH_CHARS: "1",
      ASTRA_MAX_RUN_BUDGET_USD: "0.15",
    });
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config: tightConfig,
      runner: gatingDeepRunner({ managerRef: () => managerRef!, calls }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    // The plan gate itself accrues no cost; the budget is spent on the resume
    // dispatch (literature 0.1 + counter 0.1 ≥ 0.15 → citation trips the guard).
    await passPlanGate(manager, store, { decision: "start" });

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "failed" ? row : null;
    });
    expect(run.errorMessage).toContain("budget");
    // gate(plan) + literature + counter ran before the guard tripped on citation.
    expect(calls).toHaveLength(3);
    // Completed phases survive: a retry continues instead of starting over.
    const phases = await store.listResearchPhases("run1");
    expect(phases.filter((p) => p.status === "done")).toHaveLength(3);
  });

  it("deep write-phase HITL interrupt parks the run and resumes that phase's session", async () => {
    const store = new MemoryStore();
    let managerRef: RunManager | null = null;
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({
        managerRef: () => managerRef!,
        calls,
        override: (index) =>
          // Write phase (call 4): the model asks the user → interrupt.
          index === 4
            ? {
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
              }
            : undefined,
      }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    await passPlanGate(manager, store, { decision: "start" });

    // The write phase parks on an ask_user interaction, persisting its session.
    await waitFor(async () => {
      const write = (await store.listResearchPhases("run1")).find(
        (p) => p.phase === "write",
      );
      return write?.status === "running" && write.sdkSessionId === "sess_write"
        ? write
        : null;
    });

    const interaction = (await store.listInteractions("t1")).find(
      (row) => row.type === "ask_user",
    )!;
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
    // gate(plan) + 4 phases + 1 write resume = 6, resuming the write session.
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

  // ── deep-research plan gate: decisions, fallback, replay ────────────────────

  it("plan gate start: edited plan becomes the plan output; literature reads the ORIGINAL question", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({ managerRef: () => managerRef!, calls }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep dampak AI pada literasi" }));

    const card = await waitFor(async () => {
      const pending = (await store.listPendingInteractionsByRun("run1")).find(
        (i) => i.toolName === "proposeResearchPlan",
      );
      return pending ?? null;
    });
    const editedPlan = "## Rencana suntingan\n\n1. sub pertama\n2. sub kedua";
    await store.respondInteraction(card.id, {
      kind: "plan_decision",
      decision: "start",
      editedPlan,
    });
    // Simulate Convex materializing the HITL response bubble — the heuristic this
    // replaces would have poisoned the research question with this text.
    await store.createMessage({
      threadId: "t1",
      ownerUserId: "u1",
      role: "user",
      text: "Mulai riset dengan rencana ini. (dengan suntingan)",
      runId: "run1",
      status: "complete",
    });
    await manager.resumeRun("run1", card.id);

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    const plan = (await store.listResearchPhases("run1")).find(
      (p) => p.phase === "plan",
    );
    expect(plan?.status).toBe("done");
    expect(plan?.output).toBe(editedPlan);
    // Literature (call 1) reads the edited plan AND the ORIGINAL /deep question,
    // never the materialized "(dengan suntingan)" bubble.
    expect(calls[1]!.prompt).toContain("sub pertama");
    expect(calls[1]!.prompt).toContain("dampak AI pada literasi");
    expect(calls[1]!.prompt).not.toContain("dengan suntingan");
  });

  it("plan gate reject: cancels the run, no research phase runs", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({ managerRef: () => managerRef!, calls }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    await passPlanGate(manager, store, { decision: "reject" });

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "canceled" ? row : null;
    });
    expect(run.status).toBe("canceled");
    // Only the plan phase ran; literature never dispatched.
    expect(calls).toHaveLength(1);
    expect((await store.getThread("t1"))?.status).toBe("idle");
    const canceled = (await store.listRunEvents("run1")).filter(
      (event) =>
        event.type === "run_status" &&
        JSON.parse(event.payloadJson).status === "canceled",
    );
    expect(canceled).toHaveLength(1);
    expect(JSON.parse(canceled[0]!.payloadJson).reason).toBe("plan_rejected");
  });

  it("plan gate revise: re-plans with the instruction and parks a FRESH card", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      runner: gatingDeepRunner({ managerRef: () => managerRef!, calls }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    const firstCard = await waitFor(async () => {
      const pending = (await store.listPendingInteractionsByRun("run1")).find(
        (i) => i.toolName === "proposeResearchPlan",
      );
      return pending ?? null;
    });
    await store.respondInteraction(firstCard.id, {
      kind: "plan_decision",
      decision: "revise",
      revisionInstruction: "fokuskan ke studi 2023",
    });
    await manager.resumeRun("run1", firstCard.id);

    const secondCard = await waitFor(async () => {
      const pending = (await store.listPendingInteractionsByRun("run1")).find(
        (i) => i.toolName === "proposeResearchPlan",
      );
      return pending && pending.id !== firstCard.id ? pending : null;
    });
    expect((await store.getRun("run1"))?.status).toBe("waiting_hitl");
    expect(secondCard.id).not.toBe(firstCard.id);
    // The re-plan dispatch carried the revision instruction into the prompt.
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).toContain("fokuskan ke studi 2023");
    // The old approval node was closed (symmetry with start/reject).
    const resolved = (await store.listRunEvents("run1")).filter(
      (event) =>
        event.type === "interaction_resolved" &&
        JSON.parse(event.payloadJson).interactionId === firstCard.id,
    );
    expect(resolved).toHaveLength(1);
    // The plan phase is NOT marked done on a revise.
    const plan = (await store.listResearchPhases("run1")).find(
      (p) => p.phase === "plan",
    );
    expect(plan?.status).toBe("running");
  });

  it("plan gate revise: injects the instruction even when the parked phase has NO session", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config,
      // The plan phase parks WITHOUT a system/init → sdkSessionId is undefined.
      runner: gatingDeepRunner({
        managerRef: () => managerRef!,
        calls,
        planEmitsInit: false,
      }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    const firstCard = await waitFor(async () => {
      const pending = (await store.listPendingInteractionsByRun("run1")).find(
        (i) => i.toolName === "proposeResearchPlan",
      );
      return pending ?? null;
    });
    // Precondition: the parked plan phase genuinely has no persisted session.
    const parked = (await store.listResearchPhases("run1")).find(
      (p) => p.phase === "plan",
    );
    expect(parked?.status).toBe("running");
    expect(parked?.sdkSessionId).toBeUndefined();

    await store.respondInteraction(firstCard.id, {
      kind: "plan_decision",
      decision: "revise",
      revisionInstruction: "persempit ke meta-analisis",
    });
    await manager.resumeRun("run1", firstCard.id);

    await waitFor(async () => {
      const pending = (await store.listPendingInteractionsByRun("run1")).find(
        (i) => i.toolName === "proposeResearchPlan",
      );
      return pending && pending.id !== firstCard.id ? pending : null;
    });
    // The re-plan prompt carried the instruction despite the missing session —
    // the prompt injection must not be gated on sdkSessionId.
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).toContain("persempit ke meta-analisis");
  });

  it("plan gate fallback: parks for review when the model finishes the plan WITHOUT the tool", async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const runner: QueryRunner = ({ prompt }) => {
      calls.push(prompt);
      return streamOf([
        { type: "system", subtype: "init", session_id: "sess_fallback" },
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Rencana:\n1. apa buktinya\n2. bagaimana konteksnya" },
            ],
          },
        },
        { type: "result", subtype: "success", session_id: "sess_fallback", total_cost_usd: 0.1 },
      ]);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request({ prompt: "/deep dampak AI" }));

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "waiting_hitl" ? row : null;
    });
    // Only the plan phase ran; the gate did NOT leak into literature.
    expect(calls).toHaveLength(1);
    expect((await store.getThread("t1"))?.status).toBe("idle");
    const pending = await store.listPendingInteractionsByRun("run1");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.toolName).toBe("proposeResearchPlan");
    // The free-text sub-questions were extracted into the card payload.
    expect(pending[0]!.payload.title).toBe("dampak AI");
    expect(pending[0]!.payload.questions).toEqual([
      "apa buktinya",
      "bagaimana konteksnya",
    ]);
  });

  it("plan gate replay: a re-dispatch WITHOUT a resume re-parks the same card (no duplicate)", async () => {
    const store = new MemoryStore();
    await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
    await store.createRun({
      runId: "run1",
      threadId: "t1",
      ownerUserId: "u1",
      agentKind: "lite",
      mode: "deep",
    });
    // Simulate a prior park: plan phase running + a still-pending card.
    await store.upsertResearchPhase({
      runId: "run1",
      phase: "plan",
      status: "running",
      sdkSessionId: "sess_p0",
    });
    const firstCard = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeResearchPlan",
      payload: { title: "T", questions: ["a", "b", "c"] },
    });

    const calls: string[] = [];
    const runner: QueryRunner = ({ prompt }) => {
      calls.push(prompt);
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config, runner });
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "waiting_hitl" ? row : null;
    });
    // The plan phase was NOT re-run, and no second card was opened.
    expect(calls).toHaveLength(0);
    const pending = await store.listPendingInteractionsByRun("run1");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(firstCard.id);
  });

  // ── transient connection-drop auto-retry ────────────────────────────────────

  const retryConfig = loadConfig({
    AGENTS_STREAM_FLUSH_MS: "1",
    AGENTS_STREAM_FLUSH_CHARS: "1",
    AGENTS_STREAM_RETRY_BASE_MS: "1",
    AGENTS_STREAM_RETRY_MAX_MS: "2",
    AGENTS_STREAM_MAX_RETRIES: "3",
  });

  function retryNotices(store: MemoryStore) {
    return store
      .listRunEvents("run1")
      .then((events) =>
        events.filter(
          (event) =>
            event.type === "run_status" &&
            JSON.parse(event.payloadJson).retrying === true,
        ),
      );
  }

  it("auto-retries a transient connection drop and completes the turn", async () => {
    const store = new MemoryStore();
    let calls = 0;
    const runner: QueryRunner = () => {
      calls += 1;
      if (calls === 1) {
        // The Mac switched networks mid-stream → Bun reports the socket drop.
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            throw new Error(
              "The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()",
            );
          })(),
          interrupt: async () => {},
        };
      }
      return streamOf(COMPLETED_MESSAGES);
    };
    const manager = new RunManager({ store, config: retryConfig, runner });
    await manager.startRun(request());

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(calls).toBe(2);
    expect(run.sdkSessionId).toBe("sess_1");
    // The run stayed alive across the blip and emitted ONE retry notice.
    const retried = await retryNotices(store);
    expect(retried).toHaveLength(1);
    expect(JSON.parse(retried[0]!.payloadJson).attempt).toBe(1);
    // The recovered turn's text is the final message (no partial-failure leak).
    const assistant = (await store.listMessages("t1", 10)).find(
      (m) => m.role === "assistant",
    );
    expect(assistant?.status).toBe("complete");
    expect(assistant?.text).toContain("Halo!");
  });

  it("fails after exhausting the transient-retry budget", async () => {
    const store = new MemoryStore();
    const exhaustConfig = loadConfig({
      AGENTS_STREAM_FLUSH_MS: "1",
      AGENTS_STREAM_FLUSH_CHARS: "1",
      AGENTS_STREAM_RETRY_BASE_MS: "1",
      AGENTS_STREAM_RETRY_MAX_MS: "2",
      AGENTS_STREAM_MAX_RETRIES: "2",
    });
    let calls = 0;
    const runner: QueryRunner = () => {
      calls += 1;
      return {
        stream: (async function* (): AsyncGenerator<BridgeMessage> {
          throw new Error("getaddrinfo EAI_AGAIN api.anthropic.com");
        })(),
        interrupt: async () => {},
      };
    };
    const manager = new RunManager({ store, config: exhaustConfig, runner });
    await manager.startRun(request());

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "failed" ? row : null;
    });
    // 1 initial attempt + 2 retries, then give up.
    expect(calls).toBe(3);
    expect(run.errorMessage).toContain("EAI_AGAIN");
    expect((await store.getThread("t1"))?.status).toBe("failed");
  });

  it("does not retry a terminal (non-transient) stream error", async () => {
    const store = new MemoryStore();
    let calls = 0;
    const runner: QueryRunner = () => {
      calls += 1;
      return {
        stream: (async function* (): AsyncGenerator<BridgeMessage> {
          yield { type: "system", subtype: "init", session_id: "sess_x" };
          throw new Error("provider exploded");
        })(),
        interrupt: async () => {},
      };
    };
    const manager = new RunManager({ store, config: retryConfig, runner });
    await manager.startRun(request());

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "failed" ? row : null;
    });
    // No retry: a non-transient fault fails on the first attempt.
    expect(calls).toBe(1);
    expect(await retryNotices(store)).toHaveLength(0);
    expect(run.errorMessage).toContain("provider exploded");
  });

  it("auto-retries a transient drop inside a deep phase, then continues", async () => {
    const store = new MemoryStore();
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const manager = new RunManager({
      store,
      config: retryConfig,
      runner: gatingDeepRunner({
        managerRef: () => managerRef!,
        calls,
        // The literature phase (call index 1, first post-plan dispatch) drops its
        // socket; its retry (index 2) falls through to a normal phase stream.
        override: (index) =>
          index === 1
            ? {
                stream: (async function* (): AsyncGenerator<BridgeMessage> {
                  throw new Error("fetch failed: read ECONNRESET");
                })(),
                interrupt: async () => {},
              }
            : undefined,
      }),
    });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    await passPlanGate(manager, store, { decision: "start" });

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    expect(run.status).toBe("completed");
    // plan(0) + literature drop(1) + literature retry(2) + counter(3)
    // + citation(4) + write(5) = 6 dispatches.
    expect(calls).toHaveLength(6);
    // The retry notice carried the deep phase tag.
    const retried = await retryNotices(store);
    expect(retried).toHaveLength(1);
    expect(JSON.parse(retried[0]!.payloadJson).phase).toBe("literature");
    // Every phase persisted done — the drop did not abort the run.
    const phases = await store.listResearchPhases("run1");
    expect(phases.map((p) => p.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
    // Literature's done output came from the RETRY dispatch (index 2).
    expect(phases.find((p) => p.phase === "literature")?.output).toBe("output fase 2");
  });

  it("does NOT auto-retry a resume that re-executes an approved tool (avoids duplicate side effects)", async () => {
    const store = new MemoryStore();
    await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
    await store.createRun({
      runId: "run1",
      threadId: "t1",
      ownerUserId: "u1",
      agentKind: "lite",
      mode: "normal",
    });
    await store.setRunStatus("run1", "waiting_hitl");
    const approval = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: { title: "Laporan" },
    });
    await store.respondInteraction(approval.id, { kind: "approval", approved: true });

    let calls = 0;
    const runner: QueryRunner = () => {
      calls += 1;
      return {
        stream: (async function* (): AsyncGenerator<BridgeMessage> {
          throw new Error("The socket connection was closed unexpectedly");
        })(),
        interrupt: async () => {},
      };
    };
    const manager = new RunManager({ store, config: retryConfig, runner });
    expect((await manager.resumeRun("run1", approval.id)).ok).toBe(true);

    await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "failed" ? row : null;
    });
    // Critical safety property: exactly ONE attempt. A whole-turn replay would
    // re-run executeArtifact (not idempotent) and mint a duplicate artifact.
    expect(calls).toBe(1);
    expect(await retryNotices(store)).toHaveLength(0);
  });

  it("degrades an OPTIONAL deep phase to done-partial when its retries are exhausted (run still completes)", async () => {
    const store = new MemoryStore();
    const degradeConfig = loadConfig({
      AGENTS_STREAM_FLUSH_MS: "1",
      AGENTS_STREAM_FLUSH_CHARS: "1",
      AGENTS_STREAM_RETRY_BASE_MS: "1",
      AGENTS_STREAM_RETRY_MAX_MS: "2",
      AGENTS_STREAM_MAX_RETRIES: "1",
    });
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    let managerRef: RunManager | null = null;
    const runner: QueryRunner = ({ prompt, options }) => {
      const index = calls.length;
      calls.push({ prompt, options });
      if (isPlanPrompt(prompt)) {
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            yield { type: "system", subtype: "init", session_id: `sess_p${index}` };
            await managerRef!.broker.requestApproval({
              runId: "run1",
              threadId: "t1",
              ownerUserId: "u1",
              toolName: "proposeResearchPlan",
              payload: { title: "Rencana", summary: "s", questions: ["q1", "q2", "q3"] },
            });
          })(),
          interrupt: async () => {},
        };
      }
      // The OPTIONAL citation-verification phase keeps dropping its socket; every
      // retry fails, so its budget is exhausted.
      if (prompt.includes("CITATION VERIFICATION")) {
        return {
          stream: (async function* (): AsyncGenerator<BridgeMessage> {
            throw new Error("fetch failed: read ECONNRESET");
          })(),
          interrupt: async () => {},
        };
      }
      return streamOf(phaseMessages(index));
    };
    const manager = new RunManager({ store, config: degradeConfig, runner });
    managerRef = manager;
    await manager.startRun(request({ prompt: "/deep pertanyaan riset" }));
    await passPlanGate(manager, store, { decision: "start" });

    const run = await waitFor(async () => {
      const row = await store.getRun("run1");
      return row?.status === "completed" ? row : null;
    });
    // The whole run completes — an optional quality gate must never kill it.
    expect(run.status).toBe("completed");
    const phases = await store.listResearchPhases("run1");
    const cv = phases.find((p) => p.phase === "citation_verify");
    expect(cv?.status).toBe("done");
    // Degraded with the explicit "incomplete phase" caveat.
    expect(cv?.output).toContain("budget turn habis");
    // The writer phase still ran after the degraded optional phase.
    expect(phases.find((p) => p.phase === "write")?.status).toBe("done");
  });
});
