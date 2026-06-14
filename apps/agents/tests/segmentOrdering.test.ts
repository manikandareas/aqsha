import { describe, expect, it } from "vitest";
import { buildRunHooks } from "../src/agent/hooks";
import { SegmentCoordinator } from "../src/agent/segmentCoordinator";
import { StreamBridge } from "../src/agent/streamBridge";
import { qualifiedToolName } from "../src/agent/toolPolicy";
import { MemoryStore } from "../src/store/memoryStore";

// The load-bearing Fase 1 guarantee: even when the SDK fires PreToolUse EAGERLY
// (before the consumer pulls the assistant message that announced the tool), the
// ordering barrier makes the preceding answer segment land at a LOWER seq than
// the tool_start. Here we drive the bridge + coordinator + hooks exactly in that
// adversarial order and assert the resulting event seqs.

async function setup() {
  const store = new MemoryStore();
  await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
  await store.createRun({
    runId: "run1",
    threadId: "t1",
    ownerUserId: "u1",
    agentKind: "lite",
    mode: "normal",
  });
  const message = await store.createMessage({
    threadId: "t1",
    ownerUserId: "u1",
    role: "assistant",
    text: "",
    runId: "run1",
    status: "streaming",
  });
  const coordinator = new SegmentCoordinator();
  const bridge = new StreamBridge(store, {
    runId: "run1",
    threadId: "t1",
    messageId: message.messageId,
    flushMs: 0, // every delta is flush-worthy
    flushChars: 1,
    turnKey: "turn1",
    coordinator,
    now: () => 0,
  });
  const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1", coordinator });
  const preToolUse = hooks.PreToolUse![0]!.hooks[0]!;
  const signal = new AbortController().signal;
  return { store, bridge, preToolUse, signal };
}

function seqOf(events: { seq: number; type: string; payloadJson: string }[], type: string) {
  return events.find((e) => e.type === type)?.seq;
}

describe("segment ↔ tool ordering (EAGER barrier)", () => {
  it("keeps the text segment before tool_start even when the hook fires first", async () => {
    const { store, bridge, preToolUse, signal } = await setup();

    // 1. Reasoning + text stream in for segment 0.
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "thinking_delta", thinking: "Saya perlu mencari." } },
    });
    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Mencari" } },
    });

    // 2. EAGER: the PreToolUse hook fires BEFORE the consumer pulls the assistant
    //    message that announced the tool. It must PARK on the barrier.
    const hookDone = preToolUse(
      { tool_name: qualifiedToolName("searchWeb"), tool_input: { query: "x" }, tool_use_id: "tu_X" },
      "tu_X",
      { signal },
    );
    await new Promise((r) => setTimeout(r, 5));
    // tool_start must NOT be written yet — the hook is waiting on the segment.
    expect(seqOf(await store.listRunEvents("run1"), "tool_start")).toBeUndefined();

    // 3. The consumer finally processes the assistant message (text + tool_use):
    //    this closes segment 0 and releases the barrier.
    await bridge.handle({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Mencari sumber" },
          { type: "tool_use", id: "tu_X", name: qualifiedToolName("searchWeb"), input: { query: "x" } },
        ],
      },
    });
    await hookDone; // now the hook proceeds and writes tool_start

    const events = await store.listRunEvents("run1");
    const reasoningSeq = seqOf(events, "reasoning_segment");
    const textSeq = seqOf(events, "text_segment");
    const toolSeq = seqOf(events, "tool_start");
    expect(reasoningSeq).toBeDefined();
    expect(textSeq).toBeDefined();
    expect(toolSeq).toBeDefined();
    // Precise order: reasoning < text < tool_start.
    expect(reasoningSeq!).toBeLessThan(textSeq!);
    expect(textSeq!).toBeLessThan(toolSeq!);
  });

  it("opens a fresh segment after the tool so post-tool text outranks the tool", async () => {
    const { store, bridge, preToolUse, signal } = await setup();

    await bridge.handle({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Sebelum" } },
    });
    await bridge.handle({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Sebelum alat" },
          { type: "tool_use", id: "tu_A", name: qualifiedToolName("searchWeb"), input: {} },
        ],
      },
    });
    await preToolUse(
      { tool_name: qualifiedToolName("searchWeb"), tool_use_id: "tu_A" },
      "tu_A",
      { signal },
    );
    // Post-tool answer text (segment 1).
    await bridge.handle({
      type: "assistant",
      message: { content: [{ type: "text", text: "Setelah alat: jawaban." }] },
    });
    await bridge.flush();

    const events = await store.listRunEvents("run1");
    const segs = events.filter((e) => e.type === "text_segment").sort((a, b) => a.seq - b.seq);
    const toolSeq = seqOf(events, "tool_start")!;
    // Two distinct text segments: one before the tool, one after.
    expect(segs).toHaveLength(2);
    expect(segs[0]!.seq).toBeLessThan(toolSeq);
    expect(segs[1]!.seq).toBeGreaterThan(toolSeq);
    // The two segments are distinct rows (distinct content), not one re-patched.
    expect(JSON.parse(segs[0]!.payloadJson).text).toBe("Sebelum alat");
    expect(JSON.parse(segs[1]!.payloadJson).text).toBe("Setelah alat: jawaban.");
  });
});
