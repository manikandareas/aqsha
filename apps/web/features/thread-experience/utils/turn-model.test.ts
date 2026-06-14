import type { ActivityEvent, OrderedPart } from "@aqsha/agent-contracts";
import { describe, expect, it } from "vitest";
import type { ChatMessage, ResearchRun } from "../types";
import {
  buildTurnParts,
  pairRunsWithTurns,
  toolRowModel,
  type TurnEntry,
} from "./turn-model";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-1",
    key: "message-1",
    role: "assistant",
    status: "success",
    order: 0,
    stepOrder: 0,
    text: "",
    ...overrides,
  };
}

function run(overrides: Partial<ResearchRun>): ResearchRun {
  return {
    _id: "run-1",
    mode: "normal",
    executionKind: "inline",
    status: "completed",
    retryable: false,
    activity: [],
    ...overrides,
  };
}

function node(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: "node-1",
    runId: "run-1",
    seq: 1,
    type: "tool",
    status: "completed",
    actor: "tool",
    title: "Selesai mencari web",
    visibility: "user",
    startedAt: 0,
    ...overrides,
  };
}

const runNode: ActivityEvent = node({
  id: "run-1:run",
  seq: -1,
  type: "run",
  status: "completed",
  actor: "main",
  title: "Selesai",
});

function turnKinds(entries: TurnEntry[]): string[] {
  return entries.map((entry) =>
    entry.kind === "user" ? `user:${entry.message.id}` : `turn:${entry.run?._id ?? entry.message?.id ?? "hitl"}`,
  );
}

describe("pairRunsWithTurns", () => {
  it("emits a run turn (with no answer message yet) when streaming starts before any text", () => {
    const entries = pairRunsWithTurns(
      [message({ id: "prompt", key: "prompt", role: "user", order: 0 })],
      [run({ _id: "live", status: "running", promptMessageId: "prompt", createdAt: 1 })],
    );

    expect(turnKinds(entries)).toEqual(["user:prompt", "turn:live"]);
    const turn = entries[1];
    expect(turn.kind === "assistant-turn" && turn.message).toBeUndefined();
    expect(turn.kind === "assistant-turn" && turn.run?._id).toBe("live");
  });

  it("pairs a failed run with its prompt as a single turn", () => {
    const entries = pairRunsWithTurns(
      [
        message({ id: "prompt", key: "prompt", role: "user", order: 0 }),
        message({ id: "answer", key: "answer", role: "assistant", status: "failed", order: 2 }),
      ],
      [run({ _id: "failed-run", status: "failed", promptMessageId: "prompt", createdAt: 1 })],
    );

    expect(turnKinds(entries)).toEqual(["user:prompt", "turn:failed-run"]);
    const turn = entries[1];
    expect(turn.kind === "assistant-turn" && turn.message?.id).toBe("answer");
  });

  it("places a deep research run after its prompt message", () => {
    const entries = pairRunsWithTurns(
      [
        message({ id: "prompt", key: "prompt", role: "user", order: 0 }),
        message({ id: "answer", key: "answer", role: "assistant", order: 2 }),
      ],
      [run({ _id: "deep-run", mode: "deep", promptMessageId: "prompt", createdAt: 1 })],
    );

    expect(turnKinds(entries)).toEqual(["user:prompt", "turn:deep-run"]);
  });

  it("renders one turn per run for retried runs, each with its own answer", () => {
    const entries = pairRunsWithTurns(
      [
        message({ id: "prompt", key: "prompt", role: "user", order: 0 }),
        message({ id: "answer-1", key: "answer-1", role: "assistant", order: 2 }),
        message({ id: "answer-2", key: "answer-2", role: "assistant", order: 4 }),
      ],
      [
        run({ _id: "original-run", promptMessageId: "prompt", createdAt: 1 }),
        run({ _id: "retry-run", promptMessageId: "prompt", createdAt: 3 }),
      ],
    );

    expect(turnKinds(entries)).toEqual([
      "user:prompt",
      "turn:original-run",
      "turn:retry-run",
    ]);
    const original = entries[1];
    const retry = entries[2];
    expect(original.kind === "assistant-turn" && original.message?.id).toBe("answer-1");
    expect(retry.kind === "assistant-turn" && retry.message?.id).toBe("answer-2");
  });

  it("keeps an orphaned run renderable as a turn", () => {
    const entries = pairRunsWithTurns(
      [message({ id: "answer", key: "answer", role: "assistant", order: 1 })],
      [run({ _id: "orphan-run", promptMessageId: "missing-message", createdAt: 0 })],
    );

    const last = entries.at(-1);
    expect(last?.kind === "assistant-turn" && last.run?._id).toBe("orphan-run");
  });

  it("collapses a HITL-resumed run (two assistant messages) into one turn with the final answer", () => {
    const entries = pairRunsWithTurns(
      [
        message({ id: "prompt", key: "prompt", role: "user", order: 0 }),
        message({ id: "answer-pre", key: "answer-pre", role: "assistant", order: 2 }),
        message({ id: "answer-final", key: "answer-final", role: "assistant", order: 4 }),
      ],
      [run({ _id: "hitl-run", promptMessageId: "prompt", createdAt: 1 })],
    );

    // ONE turn for the run, even though it produced two assistant messages.
    expect(turnKinds(entries)).toEqual(["user:prompt", "turn:hitl-run"]);
    const turn = entries[1];
    expect(turn.kind === "assistant-turn" && turn.message?.id).toBe("answer-final");
  });

  it("attaches pending HITL synthetic messages to their run's turn", () => {
    const hitl = message({ id: "hitl_x", key: "hitl_x", role: "assistant", order: 3 });
    const byRun = new Map<string, ChatMessage[]>([["live", [hitl]]]);
    const entries = pairRunsWithTurns(
      [message({ id: "prompt", key: "prompt", role: "user", order: 0 })],
      [run({ _id: "live", status: "waiting_hitl", promptMessageId: "prompt", createdAt: 1 })],
      byRun,
    );

    const turn = entries[1];
    expect(turn.kind === "assistant-turn" && turn.hitl?.[0]?.id).toBe("hitl_x");
  });
});

describe("buildTurnParts", () => {
  it("uses ordered parts (primary), dropping the final text segment", () => {
    const ordered: OrderedPart[] = [
      { kind: "reasoning", seq: 0, text: "memikirkan strategi" },
      { kind: "node", seq: 1, node: node({ id: "run-1:1", seq: 1, type: "tool" }) },
      { kind: "text", seq: 2, text: "jawaban akhir" },
    ];
    const parts = buildTurnParts(
      message({ id: "a", role: "assistant", status: "success", order: 2, text: "jawaban akhir" }),
      run({ _id: "run-1", orderedParts: ordered }),
    );

    expect(parts.map((part) => part.kind)).toEqual(["reasoning", "tool"]);
  });

  it("renders intermediate text inline but excludes the trailing answer segment", () => {
    const ordered: OrderedPart[] = [
      { kind: "text", seq: 0, text: "Saya akan mencari dulu." },
      { kind: "node", seq: 1, node: node({ id: "run-1:1", seq: 1, type: "tool" }) },
      { kind: "text", seq: 2, text: "jawaban akhir" },
    ];
    const parts = buildTurnParts(
      message({ id: "a", role: "assistant", status: "success", order: 2, text: "jawaban akhir" }),
      run({ _id: "run-1", orderedParts: ordered }),
    );

    expect(parts.map((part) => part.kind)).toEqual(["intermediate-text", "tool"]);
    const intermediate = parts[0];
    expect(intermediate.kind === "intermediate-text" && intermediate.text).toBe(
      "Saya akan mencari dulu.",
    );
  });

  it("falls back to message reasoning + activity nodes for a legacy run (no segments)", () => {
    const parts = buildTurnParts(
      message({
        id: "a",
        role: "assistant",
        status: "success",
        order: 2,
        text: "jawaban",
        parts: [
          { type: "reasoning", text: "penalaran" },
          { type: "text", text: "jawaban" },
        ],
      }),
      run({
        _id: "run-1",
        orderedParts: null,
        activity: [runNode, node({ id: "run-1:1", seq: 1, type: "tool" })],
      }),
    );

    expect(parts.map((part) => part.kind)).toEqual(["reasoning", "tool"]);
  });
});

describe("toolRowModel", () => {
  it("surfaces the description chip + allow-listed scalar rows", () => {
    const model = toolRowModel(
      node({
        title: "Selesai mencari web",
        status: "completed",
        description: "12 hasil",
        metadata: { tool: "searchWeb", query: "climate change", resultCount: 12 },
      }),
    );

    expect(model.title).toBe("Selesai mencari web");
    expect(model.isRunning).toBe(false);
    expect(model.description).toBe("12 hasil");
    expect(model.rows).toEqual([
      { key: "query", label: "Kueri", value: "climate change" },
      { key: "resultCount", label: "Jumlah hasil", value: "12" },
    ]);
  });

  it("default-denies non-allow-listed metadata keys (no internal ids leak)", () => {
    const model = toolRowModel(
      node({ metadata: { tool: "searchWeb", agentId: "secret", phase: "literature" } }),
    );

    expect(model.rows).toEqual([]);
  });

  it("maps verdict + boolean scalars to sentence-case Indonesian", () => {
    const model = toolRowModel(
      node({
        metadata: { tool: "verifyStatistics", checksRun: 3, verdict: "passed", hasResults: true },
      }),
    );

    expect(model.rows).toEqual([
      { key: "checksRun", label: "Pemeriksaan", value: "3" },
      { key: "verdict", label: "Hasil", value: "Lolos" },
      { key: "hasResults", label: "Dokumen ditemukan", value: "Ya" },
    ]);
  });
});
