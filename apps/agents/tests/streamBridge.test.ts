import { describe, expect, it } from "vitest";
import { StreamBridge } from "../src/agent/streamBridge";
import { MemoryStore } from "../src/store/memoryStore";

async function setup(flushChars = 5) {
  const store = new MemoryStore();
  await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
  const message = await store.createMessage({
    threadId: "t1",
    ownerUserId: "u1",
    role: "assistant",
    text: "",
    status: "streaming",
  });
  let now = 0;
  const bridge = new StreamBridge(store, {
    runId: "run1",
    threadId: "t1",
    messageId: message.messageId,
    flushMs: 1_000_000, // effectively disabled; flushes via char threshold
    flushChars,
    now: () => now,
  });
  return { store, bridge, messageId: message.messageId, advance: (ms: number) => (now += ms) };
}

describe("StreamBridge", () => {
  it("captures the session id from system/init", async () => {
    const { bridge } = await setup();
    await bridge.handle({ type: "system", subtype: "init", session_id: "sess_42" });
    expect(bridge.capturedSessionId).toBe("sess_42");
  });

  it("accumulates partial deltas and flushes past the char threshold", async () => {
    const { store, bridge, messageId } = await setup(5);
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Hal" } },
    });
    // Below threshold → not flushed yet.
    expect((await store.listMessages("t1", 10))[0]?.text).toBe("");
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "o dunia" } },
    });
    const flushed = (await store.listMessages("t1", 10)).find(
      (m) => m.messageId === messageId,
    );
    expect(flushed?.text).toBe("Halo dunia");
  });

  it("full assistant messages supersede partial deltas", async () => {
    const { bridge } = await setup();
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "partial dr" } },
    });
    await bridge.handle({
      type: "assistant",
      message: { content: [{ type: "text", text: "Jawaban final." }] },
    });
    expect(bridge.currentText).toBe("Jawaban final.");
  });

  it("ignores subagent assistant messages", async () => {
    const { bridge } = await setup();
    await bridge.handle({
      type: "assistant",
      parent_tool_use_id: "tu_sub",
      message: { content: [{ type: "text", text: "internal subagent text" }] },
    });
    expect(bridge.currentText).toBe("");
  });

  it("maps the result message into the run summary", async () => {
    const { bridge } = await setup();
    await bridge.handle({
      type: "assistant",
      message: { content: [{ type: "text", text: "Done." }] },
    });
    await bridge.handle({
      type: "result",
      subtype: "success",
      session_id: "sess_9",
      total_cost_usd: 0.0123,
      num_turns: 3,
      usage: { input_tokens: 100, output_tokens: 50 },
      result: "Done.",
    });
    const result = bridge.result();
    expect(result.sessionId).toBe("sess_9");
    expect(result.resultSubtype).toBe("success");
    expect(result.summary.costUsd).toBeCloseTo(0.0123);
    expect(result.summary.usage?.inputTokens).toBe(100);
    expect(result.finalText).toBe("Done.");
  });
});
