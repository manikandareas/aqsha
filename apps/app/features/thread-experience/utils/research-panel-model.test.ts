import { describe, expect, it } from "vitest";
import { getResearchPanelViewState } from "./research-panel-model";
import type { ResearchArtifact, ResearchRun } from "../types";

function artifact(id: string): ResearchArtifact {
  return {
    _id: id,
    type: "research_report",
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
    steps: [],
    events: [],
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
});
