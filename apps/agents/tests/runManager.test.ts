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
  });

  it("intercepts /deep: switches mode, strips the command, enables subagents", async () => {
    const store = new MemoryStore();
    let capturedOptions: Record<string, unknown> | null = null;
    let capturedPrompt = "";
    const runner: QueryRunner = ({ prompt, options }) => {
      capturedPrompt = prompt;
      capturedOptions = options;
      return streamOf(COMPLETED_MESSAGES);
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
    expect(capturedPrompt).toContain("dampak LLM");
    expect(capturedPrompt).not.toContain("/deep");
    const options = capturedOptions as unknown as Record<string, unknown>;
    expect(options.agents).toBeDefined();
    expect(Object.keys(options.agents as object)).toContain("literature-searcher");
    expect(options.allowedTools).toContain("Agent");
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
