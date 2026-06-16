import type { ActivityEvent } from "@aqsha/agent-contracts";
import { describe, expect, it } from "vitest";
import type { ResearchSource } from "../types";
import { findSubagentNode, subagentDetailModel } from "./subagent-detail-model";

function toolNode(
  id: string,
  query: string,
  resultCount: number | undefined,
): ActivityEvent {
  return {
    id,
    runId: "run1",
    seq: 1,
    type: "tool",
    status: "completed",
    actor: "tool",
    title: "Selesai mencari web",
    visibility: "user",
    startedAt: 0,
    metadata: {
      query,
      ...(resultCount === undefined ? {} : { resultCount }),
    },
  };
}

function subagent(children: ActivityEvent[]): ActivityEvent {
  return {
    id: "sub1",
    runId: "run1",
    seq: 0,
    type: "subagent",
    status: "completed",
    actor: "subagent",
    title: "Telusur literatur",
    summary: "12 pencarian, 40 sumber",
    visibility: "user",
    startedAt: 0,
    children,
  };
}

function source(
  id: string,
  discoveryQuery: string | undefined,
  url: string | undefined,
): ResearchSource {
  return {
    _id: id,
    runId: "run1",
    usage: "candidate",
    origin: "web",
    title: `Source ${id}`,
    locator: "loc",
    snippet: "snippet",
    evidenceStrength: "medium",
    discoveryQuery,
    url,
    createdAt: 0,
  };
}

describe("subagentDetailModel", () => {
  it("groups tool queries and joins sources by discoveryQuery", () => {
    const node = subagent([
      toolNode("t1", "AI tutor study", 2),
      toolNode("t2", "UNESCO guidance", 1),
    ]);
    const sources = [
      source("s1", "AI tutor study", "https://www.nature.com/x"),
      source("s2", "AI tutor study", "https://harvard.edu/y"),
      source("s3", "UNESCO guidance", "https://unesco.org/z"),
      source("s4", "unrelated", "https://example.com"),
    ];

    const model = subagentDetailModel(node, sources);

    expect(model.title).toBe("Telusur literatur");
    expect(model.summary).toBe("12 pencarian, 40 sumber");
    expect(model.groups).toHaveLength(2);
    expect(model.groups[0].query).toBe("AI tutor study");
    expect(model.groups[0].links.map((l) => l.key)).toEqual(["s1", "s2"]);
    expect(model.groups[0].links[0].domain).toBe("nature.com");
    expect(model.groups[0].links[0].favicon).toContain("nature.com");
    expect(model.groups[1].links.map((l) => l.key)).toEqual(["s3"]);
    expect(model.totalLinks).toBe(3);
  });

  it("coalesces repeated queries into one group, unioning links without dups", () => {
    const node = subagent([
      toolNode("t1", "multi-agent coordination", 0),
      toolNode("t2", "Multi-Agent  Coordination", 5),
    ]);
    const sources = [
      source("s1", "multi-agent coordination", "https://a.com"),
      source("s2", "multi-agent coordination", "https://b.com"),
      // duplicate URL across the two identical-query calls → deduped
      source("s3", "Multi-Agent Coordination", "https://a.com"),
    ];

    const model = subagentDetailModel(node, sources);
    expect(model.groups).toHaveLength(1);
    // resultCount = max single-call count (5), not the 0 row, not a sum
    expect(model.groups[0].resultCount).toBe(5);
    expect(model.groups[0].links.map((l) => l.url)).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
    expect(model.groups[0].id).toBe("t1");
  });

  it("matches by prefix when the tool query was clamped with an ellipsis", () => {
    const node = subagent([toolNode("t1", "long query about education…", 1)]);
    const sources = [
      source("s1", "long query about education and AI tutors", "https://a.com"),
    ];

    const model = subagentDetailModel(node, sources);
    expect(model.groups[0].links.map((l) => l.key)).toEqual(["s1"]);
  });

  it("is case- and whitespace-insensitive in the join", () => {
    const node = subagent([toolNode("t1", "  AI   Tutor  ", 1)]);
    const sources = [source("s1", "ai tutor", "https://a.com")];
    expect(subagentDetailModel(node, sources).groups[0].links).toHaveLength(1);
  });

  it("falls back to matched-link count when resultCount metadata is absent", () => {
    const node = subagent([toolNode("t1", "q", undefined)]);
    const sources = [
      source("s1", "q", "https://a.com"),
      source("s2", "q", "https://b.com"),
    ];
    expect(subagentDetailModel(node, sources).groups[0].resultCount).toBe(2);
  });

  it("keeps a step with no matched sources but a positive resultCount", () => {
    const node = subagent([toolNode("t1", "q", 5)]);
    const model = subagentDetailModel(node, []);
    expect(model.groups[0].resultCount).toBe(5);
    expect(model.groups[0].links).toHaveLength(0);
  });

  it("ignores non-tool children and tool children without a query", () => {
    const node = subagent([
      toolNode("t1", "q", 1),
      {
        id: "t2",
        runId: "run1",
        seq: 2,
        type: "tool",
        status: "completed",
        actor: "tool",
        title: "Menyimpan dokumen",
        visibility: "user",
        startedAt: 0,
      },
    ]);
    expect(subagentDetailModel(node, []).groups).toHaveLength(1);
  });
});

describe("findSubagentNode", () => {
  it("finds a node nested under a phase", () => {
    const tree: ActivityEvent[] = [
      {
        id: "phase1",
        runId: "run1",
        seq: 0,
        type: "phase",
        status: "completed",
        actor: "main",
        title: "Literatur",
        visibility: "user",
        startedAt: 0,
        children: [subagent([])],
      },
    ];
    expect(findSubagentNode(tree, "sub1")?.title).toBe("Telusur literatur");
    expect(findSubagentNode(tree, "missing")).toBeUndefined();
  });
});
