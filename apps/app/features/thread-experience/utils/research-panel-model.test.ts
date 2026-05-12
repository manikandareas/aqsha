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
        hasSources: false,
        artifacts: [artifact("artifact-1")],
        runs: [],
        rightPanelOpen: false,
        rightPanelTab: "sources",
        seenArtifactCount: 0,
      }),
    ).toMatchObject({
      hasResearchPayload: true,
      hasUnseenArtifact: true,
      rightPanelOpen: true,
      rightPanelTab: "artifacts",
    });
  });

  it("keeps the selected tab after artifacts have been seen", () => {
    expect(
      getResearchPanelViewState({
        hasSources: true,
        artifacts: [artifact("artifact-1")],
        runs: [],
        rightPanelOpen: true,
        rightPanelTab: "sources",
        seenArtifactCount: 1,
      }).rightPanelTab,
    ).toBe("sources");
  });

  it("treats active runs as research payload even before sources exist", () => {
    expect(
      getResearchPanelViewState({
        hasSources: false,
        artifacts: [],
        runs: [run("running")],
        rightPanelOpen: false,
        rightPanelTab: "sources",
        seenArtifactCount: 0,
      }).hasResearchPayload,
    ).toBe(true);
  });
});
