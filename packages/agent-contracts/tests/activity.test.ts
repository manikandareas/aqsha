import { describe, expect, it } from "vitest";
import {
  activityEventsFromRun,
  type ActivityEvent,
  filterByVisibility,
  orderedPartsFromRun,
  type OrderedPart,
  subagentCurrentActivity,
  subagentSummary,
} from "../src/activity";
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

describe("orderedPartsFromRun", () => {
  it("returns null for a legacy run that carries no answer segments", () => {
    const row = makeRow({
      status: "completed",
      updatedAt: 9000,
      events: [
        event(0, "run_status", { status: "running" }),
        event(1, "tool_start", { toolName: "searchWeb", toolUseId: "tu1" }),
        event(2, "tool_end", { toolName: "searchWeb", toolUseId: "tu1", status: "ok" }),
      ],
    });
    expect(orderedPartsFromRun(row)).toBeNull();
  });

  it("interleaves reasoning/text segments with tool nodes by seq", () => {
    const row = makeRow({
      status: "completed",
      updatedAt: 9000,
      events: [
        event(0, "run_status", { status: "running" }),
        event(1, "reasoning_segment", { text: "Saya perlu mencari", index: 0 }),
        event(2, "text_segment", { text: "Mari cari sumber", index: 0 }),
        event(3, "tool_start", { toolName: "searchWeb", toolUseId: "tu1" }),
        event(4, "tool_end", {
          toolName: "searchWeb",
          toolUseId: "tu1",
          status: "ok",
          resultSummary: { resultCount: 2 },
        }),
        event(5, "text_segment", { text: "Jawaban akhir.", index: 1 }),
      ],
    });
    const parts = orderedPartsFromRun(row);
    expect(parts).not.toBeNull();
    expect(parts!.map((p) => p.kind)).toEqual(["reasoning", "text", "node", "text"]);
    // The tool_start+tool_end fold into ONE node part with its description.
    const toolPart = parts![2] as Extract<OrderedPart, { kind: "node" }>;
    expect(toolPart.node.type).toBe("tool");
    expect(toolPart.node.status).toBe("completed");
    expect(toolPart.node.description).toBe("2 hasil");
    // Strict seq order across the merged streams.
    expect(parts!.map((p) => p.seq)).toEqual([1, 2, 3, 5]);
    expect((parts![0] as Extract<OrderedPart, { kind: "reasoning" }>).text).toBe(
      "Saya perlu mencari",
    );
    expect((parts![3] as Extract<OrderedPart, { kind: "text" }>).text).toBe("Jawaban akhir.");
  });

  it("keeps a sub-agent's tools nested inside its node, not as top-level parts", () => {
    const row = makeRow({
      status: "completed",
      mode: "deep",
      updatedAt: 9000,
      events: [
        event(0, "run_status", { status: "running", mode: "deep" }),
        event(1, "phase_start", { phase: "literature" }),
        event(2, "subagent_start", { agentType: "literature-searcher", agentId: "a1" }),
        event(3, "tool_start", {
          toolName: "searchArxiv",
          toolUseId: "tu2",
          parentAgentId: "a1",
        }),
        event(4, "tool_end", { toolName: "searchArxiv", toolUseId: "tu2", status: "ok" }),
        event(5, "subagent_stop", { agentType: "literature-searcher", agentId: "a1" }),
        event(6, "phase_done", { phase: "literature" }),
        event(7, "text_segment", { text: "Laporan akhir.", index: 0 }),
      ],
    });
    const parts = orderedPartsFromRun(row);
    expect(parts).not.toBeNull();
    // Only the phase node + the answer text are top-level; the sub-agent and its
    // tool are nested under the phase, never flattened into the parts list.
    expect(parts!.map((p) => p.kind)).toEqual(["node", "text"]);
    const phasePart = parts![0] as Extract<OrderedPart, { kind: "node" }>;
    expect(phasePart.node.type).toBe("phase");
    const subagent = phasePart.node.children?.[0];
    expect(subagent?.type).toBe("subagent");
    expect(subagent?.children?.[0]?.type).toBe("tool");
  });

  it("orders reasoning before text within the same step", () => {
    const row = makeRow({
      status: "completed",
      updatedAt: 9000,
      events: [
        event(0, "run_status", { status: "running" }),
        event(1, "reasoning_segment", { text: "Pikiran", index: 0 }),
        event(2, "text_segment", { text: "Tulisan", index: 0 }),
      ],
    });
    const parts = orderedPartsFromRun(row)!;
    expect(parts.map((p) => p.kind)).toEqual(["reasoning", "text"]);
  });
});

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

  it("labels the verifyIdentifiers tool with its dedicated copy (not the fallback)", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 6000,
        events: [
          event(1, "tool_start", { toolName: "verifyIdentifiers" }, 2000),
          event(2, "tool_end", { toolName: "verifyIdentifiers" }, 4000),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool?.title).toBe("Daftar kutipan diverifikasi");
    expect(tool?.title).not.toBe("Langkah selesai");
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

  it("renders the counter-evidence and citation-verifier subagent labels", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 9000,
        events: [
          event(1, "subagent_start", { agentType: "counter-evidence", agentId: "ce1" }),
          event(2, "subagent_stop", { agentType: "counter-evidence", agentId: "ce1" }),
          event(3, "subagent_start", { agentType: "citation-verifier", agentId: "cv1" }),
          event(4, "subagent_stop", { agentType: "citation-verifier", agentId: "cv1" }),
        ],
      }),
    );
    const subagents = result.filter((node) => node.type === "subagent");
    expect(subagents.map((node) => node.title)).toEqual([
      "Agen bukti pembanding selesai",
      "Agen verifikasi kutipan selesai",
    ]);
  });

  it("gives the new verifier subagents their dedicated failed labels", () => {
    const counter = activityEventsFromRun(
      makeRow({
        status: "failed",
        mode: "deep",
        updatedAt: 6000,
        events: [event(1, "subagent_start", { agentType: "counter-evidence" }, 2000)],
      }),
    ).find((node) => node.type === "subagent");
    expect(counter?.title).toBe("Agen bukti pembanding gagal");

    const verifier = activityEventsFromRun(
      makeRow({
        status: "failed",
        mode: "deep",
        updatedAt: 6000,
        events: [event(1, "subagent_start", { agentType: "citation-verifier" }, 2000)],
      }),
    ).find((node) => node.type === "subagent");
    expect(verifier?.title).toBe("Agen verifikasi kutipan gagal");
  });

  it("falls back to the generic subagent label for an unknown agent type", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 5000,
        events: [
          event(1, "subagent_start", { agentType: "mystery-agent" }),
          event(2, "subagent_stop", { agentType: "mystery-agent" }),
        ],
      }),
    );
    const subagent = result.find((node) => node.type === "subagent");
    expect(subagent?.title).toBe("Sub-agen selesai");
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

  it("labels the proposeResearchPlan approval node (not the fallback)", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "waiting_hitl",
        events: [
          event(1, "interaction_pending", {
            interactionId: "i1",
            toolName: "proposeResearchPlan",
          }),
        ],
      }),
    );
    const approval = result.find((node) => node.type === "approval");
    // Asserts the APPROVAL_LABELS.proposeResearchPlan.running entry resolves
    // (APPROVAL_LABELS is module-private, so we assert through the view-model).
    // "Menunggu persetujuan" alone is the FALLBACK_APPROVAL_LABEL sentinel.
    expect(approval?.title).toBe("Menunggu persetujuan rencana riset");
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

  it("classifies compaction as developer-only (revealed only in dev-mode)", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [event(1, "compaction", {})],
      }),
    );
    const system = result.find((node) => node.type === "system");
    expect(system?.visibility).toBe("developer");
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

  // ── Fase 2: enriched payloads (toolUseId, summaries, agentId) ──────────────

  it("pairs interleaved same-tool calls by toolUseId (not LIFO)", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 6000,
        events: [
          event(1, "tool_start", { toolName: "searchWeb", toolUseId: "tu_a" }, 1000),
          event(2, "tool_start", { toolName: "searchWeb", toolUseId: "tu_b" }, 2000),
          // First-opened tool finishes FIRST — LIFO would mis-pair this.
          event(3, "tool_end", {
            toolName: "searchWeb",
            toolUseId: "tu_a",
            status: "ok",
            resultSummary: { resultCount: 1 },
          }, 3000),
          event(4, "tool_end", {
            toolName: "searchWeb",
            toolUseId: "tu_b",
            status: "ok",
            resultSummary: { resultCount: 9 },
          }, 5000),
        ],
      }),
    );
    const first = result.find((node) => node.seq === 1)!;
    const second = result.find((node) => node.seq === 2)!;
    // tu_a opened at 1000, closed at 3000 → 2000ms, 1 hasil.
    expect(first).toMatchObject({
      status: "completed",
      durationMs: 2000,
      description: "1 hasil",
    });
    // tu_b opened at 2000, closed at 5000 → 3000ms, 9 hasil.
    expect(second).toMatchObject({
      status: "completed",
      durationMs: 3000,
      description: "9 hasil",
    });
  });

  it("fills the description from a sanitized resultSummary", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 5000,
        events: [
          event(1, "tool_start", { toolName: "searchWeb", toolUseId: "tu_1" }),
          event(2, "tool_end", {
            toolName: "searchWeb",
            toolUseId: "tu_1",
            status: "ok",
            resultSummary: { resultCount: 12 },
          }),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool).toMatchObject({
      status: "completed",
      title: "Selesai mencari web",
      description: "12 hasil",
      metadata: { tool: "searchWeb", resultCount: 12 },
    });
  });

  it("shows the inputSummary-derived description while a tool is still running", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running",
        events: [
          event(1, "tool_start", {
            toolName: "proposeArtifact",
            toolUseId: "tu_p",
            inputSummary: { action: "create", title: "Ringkasan studi" },
          }),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool).toMatchObject({
      status: "running",
      title: "Menyusun dokumen",
      description: "Ringkasan studi",
    });
  });

  it("reads agentId into the sub-agent node metadata", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 9000,
        events: [
          event(1, "subagent_start", {
            agentType: "literature-searcher",
            agentId: "agent_42",
          }),
          event(2, "subagent_stop", {
            agentType: "literature-searcher",
            agentId: "agent_42",
          }),
        ],
      }),
    );
    const subagent = result.find((node) => node.type === "subagent");
    expect(subagent?.metadata).toMatchObject({
      agentType: "literature-searcher",
      agentId: "agent_42",
    });
  });

  it("pairs parallel sub-agents by agentId, not by close order", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 9000,
        events: [
          event(1, "subagent_start", { agentType: "literature-searcher", agentId: "a1" }, 1000),
          event(2, "subagent_start", { agentType: "literature-searcher", agentId: "a2" }, 2000),
          // a1 (opened first) also stops first.
          event(3, "subagent_stop", { agentType: "literature-searcher", agentId: "a1" }, 3000),
          event(4, "subagent_stop", { agentType: "literature-searcher", agentId: "a2" }, 7000),
        ],
      }),
    );
    // Without a phase the two sub-agents are top-level siblings; agentId pairing
    // still closes each at its OWN stop, so the durations are correct (LIFO would
    // swap them). Flatten to find both regardless of nesting.
    const flatten = (nodes: typeof result): typeof result =>
      nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
    const all = flatten(result);
    const a1 = all.find((node) => node.metadata?.agentId === "a1")!;
    const a2 = all.find((node) => node.metadata?.agentId === "a2")!;
    expect(a1.durationMs).toBe(2000); // 1000 → 3000
    expect(a2.durationMs).toBe(5000); // 2000 → 7000
  });

  it("never renders the raw run.errorMessage on the header (no-leak) when no error event exists", () => {
    // A long run whose terminal `error` event was truncated by the event cap,
    // or a watchdog-failed run: only `run.errorMessage` (kept raw for ops) is
    // present. It must NOT reach the rendered header / serialized output.
    const result = activityEventsFromRun(
      makeRow({
        status: "failed",
        updatedAt: 4000,
        errorMessage: "fetch failed: ECONNREFUSED 10.0.0.5:5432\n  at /srv/app/exa.ts:42",
        events: [event(1, "tool_start", { toolName: "searchWeb", toolUseId: "tu_1" }, 2000)],
      }),
    );
    const runNode = result[0]!;
    expect(runNode.status).toBe("failed");
    expect(runNode.title).toBe("Berhenti sebelum selesai");
    expect(runNode.description).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("/srv/app");
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
  });

  it("keeps a failed tool failed even if a matching tool_end arrives after the error", () => {
    // The error handler closes the open tool as failed and de-indexes it from
    // BOTH open-tool maps; a stray later tool_end with the same toolUseId must
    // not resurrect it to completed.
    const result = activityEventsFromRun(
      makeRow({
        status: "failed",
        updatedAt: 6000,
        events: [
          event(1, "tool_start", { toolName: "searchWeb", toolUseId: "tu_1" }, 1000),
          event(2, "error", { message: "Penyedia gagal" }, 2000),
          event(3, "tool_end", {
            toolName: "searchWeb",
            toolUseId: "tu_1",
            status: "ok",
            resultSummary: { resultCount: 5 },
          }, 3000),
        ],
      }),
    );
    const tools = result.filter((node) => node.type === "tool");
    const paired = tools.find((node) => node.seq === 1)!;
    expect(paired.status).toBe("failed");
    expect(paired.title).toBe("Gagal mencari sumber web");
    expect(paired.description).toBe("Penyedia gagal");
    // The stray tool_end becomes a separate (orphan) node, never a resurrection.
    expect(tools.some((node) => node.seq === 1 && node.status === "completed")).toBe(false);
  });

  it("drops non-scalar entries smuggled into a summary (normalizer default-deny)", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 5000,
        events: [
          event(1, "tool_start", { toolName: "searchWeb", toolUseId: "tu_1" }),
          event(2, "tool_end", {
            toolName: "searchWeb",
            toolUseId: "tu_1",
            status: "ok",
            resultSummary: {
              resultCount: 3,
              leak: { secret: "rahasia-bersarang" },
              tags: ["a", "b"],
            },
          }),
        ],
      }),
    );
    const tool = result.find((node) => node.type === "tool");
    expect(tool?.metadata).toEqual({ tool: "searchWeb", resultCount: 3 });
    expect(JSON.stringify(result)).not.toContain("rahasia-bersarang");
  });

  // ── Fase 3: precise parallel-subagent nesting + cancel event ───────────────

  it("nests each parallel sub-agent's tools by parentAgentId, not by seq window", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 11000,
        events: [
          event(0, "phase_start", { phase: "literature" }),
          event(1, "subagent_start", { agentType: "literature-searcher", agentId: "a1" }),
          event(2, "subagent_start", { agentType: "literature-searcher", agentId: "a2" }),
          // Interleaved tools, each tagged with the sub-agent it ran in. By seq
          // window the innermost interval for BOTH is a2 (latest opener); only
          // parentAgentId attributes searchWeb to a1 correctly.
          event(3, "tool_start", {
            toolName: "searchArxiv",
            toolUseId: "tx",
            parentAgentId: "a2",
          }),
          event(4, "tool_start", {
            toolName: "searchWeb",
            toolUseId: "tw",
            parentAgentId: "a1",
          }),
          event(5, "tool_end", { toolName: "searchArxiv", toolUseId: "tx", status: "ok" }),
          event(6, "tool_end", { toolName: "searchWeb", toolUseId: "tw", status: "ok" }),
          event(7, "subagent_stop", { agentType: "literature-searcher", agentId: "a1" }),
          event(8, "subagent_stop", { agentType: "literature-searcher", agentId: "a2" }),
          event(9, "phase_done", { phase: "literature" }),
        ],
      }),
    );
    const flatten = (nodes: ActivityEvent[]): ActivityEvent[] =>
      nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
    const all = flatten(result);
    const phase = all.find((node) => node.type === "phase")!;
    const a1 = all.find((node) => node.metadata?.agentId === "a1")!;
    const a2 = all.find((node) => node.metadata?.agentId === "a2")!;
    const searchWeb = all.find((node) => node.metadata?.tool === "searchWeb")!;
    const searchArxiv = all.find((node) => node.metadata?.tool === "searchArxiv")!;
    // Parallel sub-agents are siblings under the phase, never nested in each other.
    expect(a1.parentId).toBe(phase.id);
    expect(a2.parentId).toBe(phase.id);
    // Each tool attaches to the sub-agent its hook reported, not the seq guess.
    expect(searchWeb.parentId).toBe(a1.id);
    expect(a1.children?.some((child) => child.id === searchWeb.id)).toBe(true);
    expect(searchArxiv.parentId).toBe(a2.id);
    expect(a2.children?.some((child) => child.id === searchArxiv.id)).toBe(true);
  });

  it("falls back to seq-window nesting for sub-agent tools without an agent_id", () => {
    // Thin Fase 1 events (no parentAgentId) must keep nesting under the sub-agent
    // window — backward compatibility for the coarse path.
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 9000,
        events: [
          event(1, "subagent_start", { agentType: "literature-searcher", agentId: "a1" }),
          event(2, "tool_start", { toolName: "searchArxiv" }),
          event(3, "tool_end", { toolName: "searchArxiv" }),
          event(4, "subagent_stop", { agentType: "literature-searcher", agentId: "a1" }),
        ],
      }),
    );
    const subagent = result.find((node) => node.type === "subagent")!;
    expect(subagent.children?.[0]).toMatchObject({ type: "tool", parentId: subagent.id });
  });

  it("consumes a streamed run_status:canceled event before the row status flips", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "running", // row not yet terminal
        updatedAt: 5000,
        events: [
          event(1, "tool_start", { toolName: "searchWeb" }, 2000),
          event(2, "run_status", { status: "canceled" }, 4000),
        ],
      }),
    );
    const runNode = result[0]!;
    expect(runNode.status).toBe("cancelled");
    expect(runNode.title).toBe("Dihentikan");
    const tool = result.find((node) => node.type === "tool");
    expect(tool?.status).toBe("cancelled");
  });

  it("keeps a main-thread tool under the phase when a sub-agent's stop event was dropped", () => {
    // A sub-agent whose subagent_stop never arrived keeps an open seq window; a
    // later main-thread tool (no agent_id) must nest under the PHASE, not get
    // swallowed by the stop-less sub-agent's unbounded window. Its own tool
    // (tagged with the agent_id) still attaches to it.
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        mode: "deep",
        updatedAt: 12000,
        events: [
          event(0, "phase_start", { phase: "literature" }),
          event(1, "subagent_start", { agentType: "literature-searcher", agentId: "a1" }),
          event(2, "tool_start", { toolName: "searchArxiv", toolUseId: "tA", parentAgentId: "a1" }),
          event(3, "tool_end", { toolName: "searchArxiv", toolUseId: "tA", parentAgentId: "a1", status: "ok" }),
          // NO subagent_stop for a1 (dropped / event-cap truncation).
          event(4, "tool_start", { toolName: "verifyCitations" }), // main thread, no agent_id
          event(5, "tool_end", { toolName: "verifyCitations", status: "ok" }),
          event(6, "phase_done", { phase: "literature" }),
        ],
      }),
    );
    const flatten = (nodes: ActivityEvent[]): ActivityEvent[] =>
      nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
    const all = flatten(result);
    const phase = all.find((node) => node.type === "phase")!;
    const a1 = all.find((node) => node.metadata?.agentId === "a1")!;
    const arxiv = all.find((node) => node.metadata?.tool === "searchArxiv")!;
    const verify = all.find((node) => node.metadata?.tool === "verifyCitations")!;
    expect(arxiv.parentId).toBe(a1.id);
    expect(verify.parentId).toBe(phase.id);
  });

  it("closes a still-open approval node on a completed run (no hanging waiting_approval)", () => {
    // Approval granted on resume but the model never retried the gated tool, so
    // no interaction_resolved arrived: the completed run must still close it.
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 5000,
        events: [
          event(1, "interaction_pending", {
            interactionId: "i1",
            toolName: "proposeArtifact",
          }),
        ],
      }),
    );
    const approval = result.find((node) => node.type === "approval")!;
    expect(approval.status).toBe("completed");
    expect(approval.title).toBe("Persetujuan diterima");
  });
});

describe("filterByVisibility", () => {
  const leaf = (id: string, visibility: ActivityEvent["visibility"]): ActivityEvent => ({
    id,
    runId: "run1",
    seq: Number(id.replace(/\D/g, "")) || 0,
    type: "tool",
    status: "completed",
    actor: "tool",
    title: id,
    visibility,
    startedAt: 0,
  });

  it("shows user always, developer only in dev-mode, and hidden never", () => {
    const nodes: ActivityEvent[] = [
      { ...leaf("n1", "user"), children: [leaf("c-dev", "developer"), leaf("c-user", "user")] },
      leaf("n2", "developer"),
      leaf("n3", "hidden"),
    ];

    const userView = filterByVisibility(nodes);
    expect(userView.map((node) => node.id)).toEqual(["n1"]);
    expect(userView[0]?.children?.map((child) => child.id)).toEqual(["c-user"]);

    const devView = filterByVisibility(nodes, { developer: true });
    expect(devView.map((node) => node.id)).toEqual(["n1", "n2"]);
    expect(devView[0]?.children?.map((child) => child.id)).toEqual(["c-dev", "c-user"]);

    // Hidden nodes never appear in either view, at any depth.
    const ids = JSON.stringify([userView, devView]);
    expect(ids).not.toContain("n3");
  });

  it("never mutates the input tree", () => {
    const nodes: ActivityEvent[] = [
      { ...leaf("n1", "user"), children: [leaf("c-dev", "developer")] },
    ];
    filterByVisibility(nodes);
    expect(nodes[0]?.children?.map((child) => child.id)).toEqual(["c-dev"]);
  });
});

// ── Fase 3: sub-agent card summaries ─────────────────────────────────────────

function toolChild(
  seq: number,
  status: ActivityEvent["status"],
  title: string,
  metadata?: Record<string, string | number | boolean>,
): ActivityEvent {
  return {
    id: `tool:${seq}`,
    runId: "run1",
    seq,
    type: "tool",
    status,
    actor: "tool",
    title,
    visibility: "user",
    startedAt: 1000,
    ...(metadata ? { metadata } : {}),
  };
}

function subagentNode(
  status: ActivityEvent["status"],
  children: ActivityEvent[],
  title = "Agen pencari literatur bekerja",
): ActivityEvent {
  return {
    id: "sa:1",
    runId: "run1",
    seq: 1,
    type: "subagent",
    status,
    actor: "subagent",
    title,
    visibility: "user",
    startedAt: 1000,
    children,
  };
}

describe("subagentSummary", () => {
  it("rolls up a finished sub-agent's tool children (count + summed sources)", () => {
    const node = subagentNode("completed", [
      toolChild(2, "completed", "Selesai mencari web", { resultCount: 5 }),
      toolChild(3, "completed", "Selesai di arXiv", { resultCount: 4 }),
      toolChild(4, "completed", "Selesai mencari web", { resultCount: 3 }),
    ]);
    expect(subagentSummary(node)).toBe("3 pencarian, 12 sumber");
  });

  it("omits the source count when no resultCount scalar is present", () => {
    const node = subagentNode("completed", [
      toolChild(2, "completed", "DOI terverifikasi", { doi: "10.x/abc" }),
      toolChild(3, "completed", "DOI terverifikasi", { doi: "10.y/def" }),
    ]);
    expect(subagentSummary(node)).toBe("2 pencarian");
  });

  it("default-denies to the sub-agent label when there are no tool children", () => {
    const node = subagentNode("completed", [], "Agen pencari literatur selesai");
    expect(subagentSummary(node)).toBe("Agen pencari literatur selesai");
  });

  it("prefers the v2 node.summary over the tool roll-up when terminal", () => {
    const node = subagentNode("completed", [
      toolChild(2, "completed", "Selesai mencari web", { resultCount: 5 }),
    ]);
    expect(subagentSummary({ ...node, summary: "Menulis respons akhir" })).toBe(
      "Menulis respons akhir",
    );
  });

  it("falls back to the tool roll-up when the v2 summary is empty", () => {
    const node = subagentNode("completed", [
      toolChild(2, "completed", "Selesai mencari web", { resultCount: 5 }),
    ]);
    expect(subagentSummary({ ...node, summary: "   " })).toBe("1 pencarian, 5 sumber");
  });

  it("carries the sanitized summary from a subagent_stop event onto the node (v2)", () => {
    const result = activityEventsFromRun(
      makeRow({
        status: "completed",
        updatedAt: 9000,
        events: [
          event(1, "subagent_start", { agentType: "literature-searcher", agentId: "a1" }),
          event(2, "tool_start", { toolName: "searchArxiv", parentAgentId: "a1" }),
          event(3, "tool_end", { toolName: "searchArxiv", parentAgentId: "a1" }),
          event(4, "subagent_stop", {
            agentType: "literature-searcher",
            agentId: "a1",
            summary: "Menulis respons akhir",
          }),
        ],
      }),
    );
    const subagent = result.find((node) => node.type === "subagent");
    expect(subagent?.summary).toBe("Menulis respons akhir");
    expect(subagentSummary(subagent!)).toBe("Menulis respons akhir");
  });
});

describe("subagentCurrentActivity", () => {
  it("picks the highest-seq running tool child (deterministic, anti-flicker)", () => {
    const node = subagentNode("running", [
      toolChild(2, "running", "Mencari sumber web"),
      toolChild(5, "running", "Mencari preprint arXiv"),
      toolChild(3, "completed", "Selesai mencari web"),
    ]);
    expect(subagentCurrentActivity(node)).toBe("Mencari preprint arXiv");
  });

  it("returns undefined when no tool child is running yet", () => {
    const node = subagentNode("running", [
      toolChild(2, "completed", "Selesai mencari web"),
    ]);
    expect(subagentCurrentActivity(node)).toBeUndefined();
  });

  it("returns undefined when the sub-agent has no children yet", () => {
    expect(subagentCurrentActivity(subagentNode("running", []))).toBeUndefined();
  });
});
