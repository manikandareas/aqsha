import type { ResearchArtifact, ResearchRun } from "../types";
import { isRunActive } from "./transcript-model";

export function getResearchPanelViewState({
  artifacts,
  runs,
  rightPanelOpen,
  seenArtifactCount,
}: {
  artifacts: ResearchArtifact[] | undefined;
  runs: ResearchRun[];
  rightPanelOpen: boolean;
  seenArtifactCount: number;
}) {
  const artifactCount = artifacts?.length ?? 0;
  const hasResearchPayload =
    artifactCount > 0 || runs.some(isRunActive);
  const hasUnseenArtifact = artifactCount > seenArtifactCount;

  return {
    artifactCount,
    hasResearchPayload,
    hasUnseenArtifact,
    rightPanelOpen: hasResearchPayload && (rightPanelOpen || hasUnseenArtifact),
  };
}
