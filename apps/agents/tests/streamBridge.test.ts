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
    turnKey: "turn1",
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
      turnKey: "turn1",
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

  it("captures thinking deltas as reasoning, separate from chat text", async () => {
    const { store, bridge, messageId } = await setup(5);
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "thinking_delta", thinking: "Let me " } },
    });
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "thinking_delta", thinking: "consider this." } },
    });
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Final answer." } },
    });
    await bridge.flush();
    const row = (await store.listMessages("t1", 10)).find(
      (m) => m.messageId === messageId,
    );
    expect(row?.reasoning).toBe("Let me consider this.");
    expect(row?.text).toBe("Final answer.");
    expect(bridge.currentReasoning).toBe("Let me consider this.");
  });

  it("accepts the gateway `reasoning` field as a thinking alias", async () => {
    const { bridge } = await setup(5);
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "reasoning_delta", reasoning: "hmm" } },
    });
    expect(bridge.currentReasoning).toBe("hmm");
  });

  it("full thinking blocks supersede partial reasoning deltas", async () => {
    const { bridge } = await setup();
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "thinking_delta", thinking: "partial reaso" } },
    });
    await bridge.handle({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "Considered fully." },
          { type: "text", text: "Done." },
        ],
      },
    });
    expect(bridge.currentReasoning).toBe("Considered fully.");
    expect(bridge.currentText).toBe("Done.");
  });

  it("ignores subagent reasoning blocks", async () => {
    const { bridge } = await setup();
    await bridge.handle({
      type: "assistant",
      parent_tool_use_id: "tu_sub",
      message: { content: [{ type: "thinking", thinking: "subagent thought" }] },
    });
    expect(bridge.currentReasoning).toBe("");
  });

  it("emits coalesced answer segments for a no-tool turn (one row per kind)", async () => {
    const { store, bridge } = await setup(5);
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "thinking_delta", thinking: "Berpikir dulu." } },
    });
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Halo " } },
    });
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "dunia jawaban" } },
    });
    await bridge.flush();
    const events = await store.listRunEvents("run1");
    const reasoning = events.filter((e) => e.type === "reasoning_segment");
    const text = events.filter((e) => e.type === "text_segment");
    // Coalesced: ONE row per kind across many deltas, re-patched in place.
    expect(reasoning).toHaveLength(1);
    expect(text).toHaveLength(1);
    expect(JSON.parse(reasoning[0]!.payloadJson).text).toBe("Berpikir dulu.");
    expect(JSON.parse(text[0]!.payloadJson).text).toBe("Halo dunia jawaban");
    // Reasoning is written first → lower seq than the text it precedes.
    expect(reasoning[0]!.seq).toBeLessThan(text[0]!.seq);
  });

  it("writes no segment events in silent mode", async () => {
    const store = new MemoryStore();
    await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
    const message = await store.createMessage({
      threadId: "t1",
      ownerUserId: "u1",
      role: "assistant",
      text: "",
      status: "streaming",
    });
    const bridge = new StreamBridge(store, {
      runId: "run1",
      threadId: "t1",
      messageId: message.messageId,
      flushMs: 0,
      flushChars: 1,
      turnKey: "turn1",
      silent: true,
      now: () => 0,
    });
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "teks fase senyap" } },
    });
    await bridge.flush();
    expect(await store.listRunEvents("run1")).toHaveLength(0);
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
