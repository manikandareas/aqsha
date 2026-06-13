import { describe, expect, it } from "vitest";
import {
  defaultExpandedSourcePaths,
  getResearchPanelViewState,
  getSourceCountsByOwner,
  getSourceGroups,
  selectedSourcePath,
  sourceGroupPath,
} from "./research-panel-model";
import type { ResearchArtifact, ResearchRun, ResearchSource } from "../types";

function artifact(id: string): ResearchArtifact {
  return {
    _id: id,
    artifactType: "markdown",
    title: "Report",
    createdAt: 1,
  };
}

function run(status: ResearchRun["status"]): ResearchRun {
  return {
    _id: `run-${status}`,
    mode: "deep",
    executionKind: "workflow",
    status,
    retryable: false,
    activity: [],
  };
}

function source(id: string, owner: { messageId?: string; runId?: string }): ResearchSource {
  return {
    _id: id,
    ...owner,
    usage: "candidate",
    origin: "web",
    evidenceStrength: "medium",
    title: `Source ${id}`,
    locator: `https://example.com/${id}`,
    url: `https://example.com/${id}`,
    snippet: "Snippet",
    createdAt: id.charCodeAt(id.length - 1),
  };
}

describe("research panel model", () => {
  it("auto-opens the artifact tab when an unseen artifact appears", () => {
    expect(
      getResearchPanelViewState({
        artifacts: [artifact("artifact-1")],
        runs: [],
        rightPanelOpen: false,
        seenArtifactCount: 0,
      }),
    ).toMatchObject({
      hasResearchPayload: true,
      hasUnseenArtifact: true,
      rightPanelOpen: true,
    });
  });

  it("stays open after artifacts have been seen when requested", () => {
    expect(
      getResearchPanelViewState({
        artifacts: [artifact("artifact-1")],
        runs: [],
        rightPanelOpen: true,
        seenArtifactCount: 1,
      }).rightPanelOpen,
    ).toBe(true);
  });

  it("treats active runs as research payload before artifacts exist", () => {
    expect(
      getResearchPanelViewState({
        artifacts: [],
        runs: [run("running")],
        rightPanelOpen: false,
        seenArtifactCount: 0,
      }).hasResearchPayload,
    ).toBe(true);
  });

  it("does not auto-open only because sources exist", () => {
    expect(
      getResearchPanelViewState({
        artifacts: [],
        runs: [],
        rightPanelOpen: false,
        seenArtifactCount: 0,
      }).rightPanelOpen,
    ).toBe(false);
  });

  it("groups sources by run and assistant message", () => {
    const groups = getSourceGroups([
      source("source-a", { runId: "run-1" }),
      source("source-b", { messageId: "message-1" }),
      source("source-c", { runId: "run-1" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "run:run-1",
      path: "sources/runs/run-1",
    });
    expect(groups[0]?.sources.map((item) => item._id)).toEqual([
      "source-a",
      "source-c",
    ]);
    expect(groups[1]).toMatchObject({
      key: "message:message-1",
      path: "sources/messages/message-1",
    });
  });

  it("counts sources by message and run", () => {
    const counts = getSourceCountsByOwner([
      source("source-a", { runId: "run-1" }),
      source("source-b", { messageId: "message-1" }),
      source("source-c", { runId: "run-1" }),
    ]);

    expect(counts.byRunId.get("run-1")).toBe(2);
    expect(counts.byMessageId.get("message-1")).toBe(1);
  });

  it("expands only the focused source group when focus is provided", () => {
    const groups = getSourceGroups([
      source("source-a", { runId: "run-1" }),
      source("source-b", { messageId: "message-1" }),
    ]);

    expect(defaultExpandedSourcePaths(groups, { type: "run", runId: "run-1" })).toEqual(
      new Set(["sources/runs/run-1"]),
    );
    expect(sourceGroupPath({ type: "message", messageId: "message-1" })).toBe(
      "sources/messages/message-1",
    );
    expect(selectedSourcePath(groups[0]!.sources[0]!)).toBe(
      "sources/runs/run-1/source-a",
    );
  });
});
