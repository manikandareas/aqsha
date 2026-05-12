import type { ResearchArtifact, ResearchRun } from "../types";
import { isRunActive } from "./transcript-model";

export type ResearchPanelTab = "sources" | "artifacts";

export function getResearchPanelViewState({
  hasSources,
  artifacts,
  runs,
  rightPanelOpen,
  rightPanelTab,
  seenArtifactCount,
}: {
  hasSources: boolean;
  artifacts: ResearchArtifact[] | undefined;
  runs: ResearchRun[];
  rightPanelOpen: boolean;
  rightPanelTab: ResearchPanelTab;
  seenArtifactCount: number;
}) {
  const artifactCount = artifacts?.length ?? 0;
  const hasResearchPayload =
    hasSources || artifactCount > 0 || runs.some(isRunActive);
  const hasUnseenArtifact = artifactCount > seenArtifactCount;

  return {
    artifactCount,
    hasResearchPayload,
    hasUnseenArtifact,
    rightPanelOpen: hasResearchPayload && (rightPanelOpen || hasUnseenArtifact),
    rightPanelTab: hasUnseenArtifact ? "artifacts" : rightPanelTab,
  };
}
