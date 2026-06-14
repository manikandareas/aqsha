import type { ActivityEvent, OrderedPart } from "@aqsha/agent-contracts";
import { describe, expect, it } from "vitest";
import type { ChatMessage, ResearchArtifact, ResearchRun } from "../types";
import {
  buildTurnParts,
  chatArtifactCardModel,
  isArtifactToolNode,
  pairRunsWithTurns,
  runningSubagentCount,
  subagentCardModel,
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

function artifactRow(overrides: Partial<ResearchArtifact>): ResearchArtifact {
  return {
    _id: "art_1",
    title: "Ringkasan riset",
    artifactType: "markdown",
    source: "agent",
    createdAt: 1000,
    updatedAt: 2000,
    workspaceId: "ws_1",
    ...overrides,
  };
}

function artifactNode(overrides: Partial<ActivityEvent>): ActivityEvent {
  return node({
    type: "tool",
    title: "Dokumen disimpan",
    metadata: { tool: "executeArtifact" },
    ...overrides,
  });
}

describe("isArtifactToolNode", () => {
  it("is true only for an executeArtifact tool node", () => {
    expect(isArtifactToolNode(artifactNode({}))).toBe(true);
    expect(isArtifactToolNode(node({ metadata: { tool: "searchWeb" } }))).toBe(false);
    expect(isArtifactToolNode(node({ metadata: { tool: "proposeArtifact" } }))).toBe(false);
    expect(isArtifactToolNode(node({ type: "subagent", metadata: { tool: "executeArtifact" } }))).toBe(
      false,
    );
    expect(isArtifactToolNode(node({ metadata: undefined }))).toBe(false);
  });
});

describe("chatArtifactCardModel", () => {
  it("is live (writing) while the node is still running, with no id yet", () => {
    const model = chatArtifactCardModel(
      artifactNode({ status: "running", metadata: { tool: "executeArtifact", title: "Draf" } }),
      new Map(),
    );
    expect(model.live).toBe(true);
    expect(model.action).toBe("create");
    expect(model.artifactId).toBeUndefined();
    expect(model.title).toBe("Draf");
  });

  it("resolves the row for a created artifact (title/type/provenance/timestamps)", () => {
    const model = chatArtifactCardModel(
      artifactNode({
        status: "completed",
        metadata: { tool: "executeArtifact", artifactId: "art_1", action: "create" },
      }),
      new Map([["art_1", artifactRow({})]]),
    );
    expect(model.live).toBe(false);
    expect(model.found).toBe(true);
    expect(model.action).toBe("create");
    expect(model.title).toBe("Ringkasan riset");
    expect(model.artifactType).toBe("markdown");
    expect(model.source).toBe("agent");
    expect(model.createdAt).toBe(1000);
    expect(model.updatedAt).toBe(2000);
    expect(model.workspaceId).toBe("ws_1");
  });

  it("reports the update action for a re-written artifact", () => {
    const model = chatArtifactCardModel(
      artifactNode({
        status: "completed",
        metadata: { tool: "executeArtifact", artifactId: "art_1", action: "update" },
      }),
      new Map([["art_1", artifactRow({ title: "Versi baru" })]]),
    );
    expect(model.action).toBe("update");
    expect(model.title).toBe("Versi baru");
  });

  it("falls back to the node title when the id resolves to no row", () => {
    const model = chatArtifactCardModel(
      artifactNode({
        status: "completed",
        metadata: { tool: "executeArtifact", artifactId: "art_missing", action: "create", title: "Tak ketemu" },
      }),
      new Map([["art_1", artifactRow({})]]),
    );
    expect(model.found).toBe(false);
    expect(model.title).toBe("Tak ketemu");
    expect(model.workspaceId).toBeUndefined();
  });

  it("uses a default title when neither a row nor a node title exists", () => {
    const model = chatArtifactCardModel(
      artifactNode({ status: "completed", metadata: { tool: "executeArtifact", artifactId: "art_x" } }),
      new Map(),
    );
    expect(model.title).toBe("Dokumen");
  });
});

describe("buildTurnParts — artifact node", () => {
  it("emits an artifact part for an executeArtifact node (primary path)", () => {
    const ordered: OrderedPart[] = [
      {
        kind: "node",
        seq: 1,
        node: artifactNode({
          id: "run-1:1",
          seq: 1,
          status: "completed",
          metadata: { tool: "executeArtifact", artifactId: "art_1", action: "create" },
        }),
      },
      { kind: "text", seq: 2, text: "selesai" },
    ];
    const parts = buildTurnParts(
      message({ id: "a", role: "assistant", status: "success", order: 2, text: "selesai" }),
      run({ _id: "run-1", orderedParts: ordered }),
    );
    expect(parts.map((part) => part.kind)).toEqual(["artifact"]);
  });

  it("emits an artifact part in the legacy fallback path too", () => {
    const parts = buildTurnParts(
      message({ id: "a", role: "assistant", status: "success", order: 2, text: "x" }),
      run({
        _id: "run-1",
        orderedParts: null,
        activity: [runNode, artifactNode({ id: "run-1:1", seq: 1, status: "completed" })],
      }),
    );
    expect(parts.map((part) => part.kind)).toEqual(["artifact"]);
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

function toolChild(overrides: Partial<ActivityEvent>): ActivityEvent {
  return node({ id: `tool-${overrides.seq ?? 1}`, type: "tool", ...overrides });
}

function subagentNode(overrides: Partial<ActivityEvent>): ActivityEvent {
  return node({
    id: "sa-1",
    type: "subagent",
    actor: "subagent",
    title: "Agen pencari literatur bekerja",
    ...overrides,
  });
}

describe("subagentCardModel", () => {
  it("uses the live tool activity as the summary while running", () => {
    const model = subagentCardModel(
      subagentNode({
        status: "running",
        children: [
          toolChild({ seq: 2, status: "running", title: "Mencari sumber web" }),
        ],
      }),
    );

    expect(model.isRunning).toBe(true);
    expect(model.summary).toBe("Mencari sumber web");
    expect(model.forceExpanded).toBe(false);
    expect(model.children).toHaveLength(1);
  });

  it("uses the terminal roll-up as the summary once finished", () => {
    const model = subagentCardModel(
      subagentNode({
        status: "completed",
        title: "Agen pencari literatur selesai",
        children: [
          toolChild({ seq: 2, status: "completed", title: "Selesai mencari web", metadata: { resultCount: 7 } }),
          toolChild({ seq: 3, status: "completed", title: "Selesai di arXiv", metadata: { resultCount: 5 } }),
        ],
      }),
    );

    expect(model.isRunning).toBe(false);
    expect(model.summary).toBe("2 pencarian, 12 sumber");
  });

  it("hides children behind expand normally but forces them open in dev-mode", () => {
    const sub = subagentNode({
      status: "completed",
      children: [toolChild({ seq: 2, status: "completed", title: "Selesai mencari web" })],
    });

    expect(subagentCardModel(sub).forceExpanded).toBe(false);
    expect(subagentCardModel(sub, { devMode: true }).forceExpanded).toBe(true);
  });
});

describe("runningSubagentCount", () => {
  it("counts only running sub-agent nodes (for the 'N berjalan' chip)", () => {
    const nodes = [
      subagentNode({ id: "sa-a", status: "running" }),
      subagentNode({ id: "sa-b", status: "running" }),
      subagentNode({ id: "sa-c", status: "completed" }),
      node({ id: "tool-x", type: "tool", status: "running" }),
    ];
    expect(runningSubagentCount(nodes)).toBe(2);
  });

  it("returns 0 when no sub-agent is running", () => {
    expect(runningSubagentCount([subagentNode({ status: "completed" })])).toBe(0);
  });
});
