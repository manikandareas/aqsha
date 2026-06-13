import { describe, expect, it } from "vitest";
import { activityEventsFromRun } from "../src/activity";
import type { AgentRunRow } from "../src/uiAdapters";

type RawEvent = AgentRunRow["events"][number];

function event(
  seq: number,
  type: string,
  payload: Record<string, unknown> = {},
  createdAt = 1000 + seq * 1000,
): RawEvent {
  return {
    id: `run1:${seq}`,
    seq,
    type,
    payloadJson: JSON.stringify(payload),
    createdAt,
  };
}

function makeRow(partial: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    runId: "run1",
    status: "running",
    mode: "normal",
    agentKind: "lite",
    createdAt: 1000,
    updatedAt: 1000,
    events: [],
    ...partial,
  };
}

describe("activityEventsFromRun", () => {
  it("emits a running run header for a freshly started run with no events", () => {
    const result = activityEventsFromRun(makeRow({ status: "running" }));
    const runNode = result[0]!;
    const rest = result.slice(1);
    expect(runNode).toMatchObject({
      type: "run",
      status: "running",
      title: "Menjalankan permintaan",
      visibility: "user",
      seq: -1,
    });
    expect(runNode.endedAt).toBeUndefined();
    expect(rest).toHaveLength(0);
  });

  it("uses the deep-research run title for deep runs", () => {
    const runNode = activityEventsFromRun(
      makeRow({ status: "running", mode: "deep" }),
    )[0]!;
    expect(runNode.title).toBe("Riset mendalam");
  });

  it("orders events by seq even when the input array is shuffled", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [
          event(3, "tool_start", { toolName: "verifyCitations" }),
          event(1, "tool_start", { toolName: "searchThreadDocuments" }),
          event(2, "tool_end", { toolName: "searchThreadDocuments" }),
        ],
      }),
    );
    const timeline = result.filter((node) => node.type !== "run");
    expect(timeline.map((node) => node.seq)).toEqual([1, 3]);
  });

  it("folds tool_start + tool_end into one running→completed node with durationMs", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 6000,
        events: [
          event(0, "run_status", { status: "running" }, 1000),
          event(1, "tool_start", { toolName: "searchWeb" }, 2000),
          event(2, "tool_end", { toolName: "searchWeb" }, 4000),
          event(3, "run_status", { status: "completed" }, 6000),
        ],
      }),
    );
    expect(result).toHaveLength(2);
    const runNode = result[0]!;
    const tool = result[1]!;
    expect(runNode.status).toBe("completed");
    expect(tool).toMatchObject({
      type: "tool",
      actor: "tool",
      status: "completed",
      title: "Selesai mencari web",
      durationMs: 2000,
      metadata: { tool: "searchWeb" },
    });
  });

  it("keeps a tool with no end as a live running node", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [event(1, "tool_start", { toolName: "searchArxiv" })],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool).toMatchObject({
      status: "running",
      title: "Mencari preprint arXiv",
    });
    expect(tool?.endedAt).toBeUndefined();
    expect(tool?.durationMs).toBeUndefined();
  });

  it("renders citation_check as a completed node with a safe summary", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 3000,
        events: [
          event(1, "citation_check", {
            checked: 8,
            verified: 7,
            flagged: 1,
            rawItems: [{ reference: "secret title", doi: "10.x" }],
          }),
        ],
      }),
    );
    const node = result.find((n) => n.type === "tool");
    expect(node).toMatchObject({
      status: "completed",
      title: "Kutipan diverifikasi",
      description: "8 diperiksa, 1 ditandai",
      metadata: { checked: 8, verified: 7, flagged: 1 },
    });
    // The raw items array must never reach the view-model.
    expect(JSON.stringify(result)).not.toContain("secret title");
    expect(node?.metadata).not.toHaveProperty("rawItems");
  });

  it("folds a sub-agent window and nests its tools as children", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 9000,
        events: [
          event(1, "subagent_start", { agentType: "literature-searcher" }),
          event(2, "tool_start", { toolName: "searchArxiv" }),
          event(3, "tool_end", { toolName: "searchArxiv" }),
          event(4, "subagent_stop", { agentType: "literature-searcher" }),
        ],
      }),
    );
    const timeline = result.filter((node) => node.type !== "run");
    expect(timeline).toHaveLength(1);
    const subagent = timeline[0]!;
    expect(subagent).toMatchObject({
      type: "subagent",
      actor: "subagent",
      status: "completed",
      title: "Agen pencari literatur selesai",
    });
    expect(subagent.children).toHaveLength(1);
    expect(subagent.children![0]).toMatchObject({
      type: "tool",
      title: "Selesai di arXiv",
      parentId: subagent.id,
    });
  });

  it("nests phase → sub-agent → tool for deep runs", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 12000,
        events: [
          event(0, "phase_start", { phase: "literature" }),
          event(1, "subagent_start", { agentType: "literature-searcher" }),
          event(2, "tool_start", { toolName: "searchArxiv" }),
          event(3, "tool_end", { toolName: "searchArxiv" }),
          event(4, "subagent_stop", { agentType: "literature-searcher" }),
          event(5, "phase_done", { phase: "literature" }),
        ],
      }),
    );
    const timeline = result.filter((node) => node.type !== "run");
    expect(timeline).toHaveLength(1);
    const phase = timeline[0]!;
    expect(phase).toMatchObject({ type: "phase", title: "Literatur terkumpul" });
    const subagent = phase.children![0]!;
    expect(subagent.type).toBe("subagent");
    expect(subagent.parentId).toBe(phase.id);
    expect(subagent.children![0]).toMatchObject({ type: "tool", title: "Selesai di arXiv" });
  });

  it("marks the open tool failed when an error event fires", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "failed",
        updatedAt: 5000,
        events: [
          event(1, "tool_start", { toolName: "searchWeb" }),
          event(2, "error", { message: "Penyedia pencarian tidak merespons" }),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool).toMatchObject({
      status: "failed",
      // Failed nodes must read as failed, never as the running action.
      title: "Gagal mencari sumber web",
      description: "Penyedia pencarian tidak merespons",
    });
    expect(tool?.title).not.toBe("Mencari sumber web");
  });

  it("surfaces a run-level error on the run header when no tool is open", () => {
    const runNode = activityEventsFromRun(
      makeRow({
        status: "failed",
        updatedAt: 2000,
        events: [event(0, "error", { message: "Stream gagal" })],
      }),
    )[0]!;
    expect(runNode).toMatchObject({
      type: "run",
      status: "failed",
      title: "Berhenti sebelum selesai",
      description: "Stream gagal",
    });
  });

  it("closes still-running nodes when the run ends failed", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "failed",
        updatedAt: 4000,
        events: [event(1, "tool_start", { toolName: "searchWeb" }, 2000)],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool?.status).toBe("failed");
    expect(tool?.title).toBe("Gagal mencari sumber web");
    expect(tool?.endedAt).toBe(4000);
  });

  it("marks a tool failed (not running) when tool_end reports an error", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 5000,
        events: [
          event(1, "tool_start", { toolName: "lookupDoi" }, 2000),
          event(2, "tool_end", { toolName: "lookupDoi", status: "error" }, 4000),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool).toMatchObject({ status: "failed", title: "Gagal memverifikasi DOI" });
  });

  it("uses the completed title when the run finishes a still-open tool", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 4000,
        events: [event(1, "tool_start", { toolName: "searchWeb" }, 2000)],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool).toMatchObject({ status: "completed", title: "Selesai mencari web" });
  });

  it("gives a failed sub-agent its dedicated failed label", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "failed",
        mode: "deep",
        updatedAt: 6000,
        events: [event(1, "subagent_start", { agentType: "literature-searcher" }, 2000)],
      }),
    );
    const subagent = result.find((node) => node.type === "subagent");
    expect(subagent).toMatchObject({
      status: "failed",
      title: "Agen pencari literatur gagal",
    });
  });

  it("bounds error copy to a single trimmed line", () => {
    const longTail = "x".repeat(400);
    const result = activityEventsFromRun(
      makeRow({
        status: "failed",
        updatedAt: 2000,
        events: [
          event(0, "error", {
            message: `Koneksi gagal\n  at internal/file.ts:42:13\n${longTail}`,
          }),
        ],
      }),
    );
    const runNode = result[0]!;
    expect(runNode.description).toBe("Koneksi gagal");
    // No stack-trace second line leaks through.
    expect(JSON.stringify(result)).not.toContain("internal/file.ts");
  });

  it("cancels still-running nodes when the run is canceled", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "canceled",
        updatedAt: 4000,
        events: [event(1, "tool_start", { toolName: "searchWeb" })],
      }),
    );
    const runNode = result[0]!;
    const tool = result[1]!;
    expect(runNode.status).toBe("cancelled");
    expect(runNode.title).toBe("Dihentikan");
    expect(tool.status).toBe("cancelled");
  });

  it("opens a waiting_approval node on interaction_pending", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "waiting_hitl",
        events: [
          event(1, "interaction_pending", {
            interactionId: "i1",
            toolName: "proposeArtifact",
          }),
        ],
      }),
    );
    const approval = result.find((node) => node.type === "approval");
    expect(approval).toMatchObject({
      status: "waiting_approval",
      actor: "system",
      title: "Menunggu persetujuan dokumen",
    });
  });

  it("closes the approval node when the interaction resolves", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [
          event(1, "interaction_pending", {
            interactionId: "i1",
            toolName: "proposeArtifact",
          }),
          event(2, "interaction_resolved", {
            interactionId: "i1",
            toolName: "proposeArtifact",
          }),
        ],
      }),
    );
    const approval = result.find((node) => node.type === "approval");
    expect(approval).toMatchObject({
      status: "completed",
      title: "Persetujuan diterima",
    });
  });

  it("keeps compaction hidden from users", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [event(1, "compaction", {})],
      }),
    );
    const system = result.find((node) => node.type === "system");
    expect(system?.visibility).toBe("hidden");
  });

  it("produces a flat, accurate timeline for a normal multi-tool run", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [
          event(0, "run_status", { status: "running" }),
          event(1, "tool_start", { toolName: "searchThreadDocuments" }),
          event(2, "tool_end", { toolName: "searchThreadDocuments" }),
          event(3, "tool_start", { toolName: "searchWeb" }),
        ],
      }),
    );
    expect(result).toHaveLength(3);
    const runNode = result[0]!;
    const first = result[1]!;
    const second = result[2]!;
    expect(runNode.type).toBe("run");
    expect(first).toMatchObject({
      title: "Selesai mencari dokumen",
      status: "completed",
    });
    expect(second).toMatchObject({ title: "Mencari sumber web", status: "running" });
    expect(first.children).toBeUndefined();
    expect(second.children).toBeUndefined();
  });

  it("never copies raw payload keys (query/apiKey) into the view-model", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 3000,
        events: [
          event(1, "tool_start", {
            toolName: "searchWeb",
            query: "kueri rahasia pengguna",
            apiKey: "sk-secret-123",
          }),
          event(2, "tool_end", { toolName: "searchWeb" }),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool?.metadata).toEqual({ tool: "searchWeb" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("kueri rahasia pengguna");
    expect(serialized).not.toContain("sk-secret-123");
  });
});
