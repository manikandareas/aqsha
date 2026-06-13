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

  it("never blocks stream consumption on store latency (single in-flight, coalesced)", async () => {
    // Regression for the live Step-2 lag: a slow store round-trip must not
    // throttle handle(); writes pipeline one-at-a-time with the latest text.
    const store = new MemoryStore();
    await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
    const message = await store.createMessage({
      threadId: "t1",
      ownerUserId: "u1",
      role: "assistant",
      text: "",
      status: "streaming",
    });
    let writes = 0;
    let release: (() => void) | null = null;
    const slowStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === "updateMessageText") {
          return async (messageId: string, text: string) => {
            writes += 1;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return store.updateMessageText(messageId, text);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const bridge = new StreamBridge(slowStore, {
      runId: "run1",
      threadId: "t1",
      messageId: message.messageId,
      flushMs: 1_000_000,
      flushChars: 1, // every delta is flush-worthy
      now: () => 0,
    });

    const start = Date.now();
    for (let i = 0; i < 20; i += 1) {
      await bridge.handle({
        type: "stream_event",
        event: { delta: { type: "text_delta", text: `t${i} ` } },
      });
    }
    // All 20 deltas consumed instantly even though the first write is hung.
    expect(Date.now() - start).toBeLessThan(100);
    expect(writes).toBe(1);

    // Release the hung write → exactly one trailing coalesced write follows.
    const drained = bridge.flush();
    while (release) {
      const current: () => void = release;
      release = null;
      current();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await drained;
    const [assistant] = await store.listMessages("t1", 10);
    expect(assistant?.text).toContain("t19");
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
