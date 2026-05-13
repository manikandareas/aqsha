import { useState } from "react";
import type { ResearchArtifact, ResearchRun } from "../types";
import { getResearchPanelViewState } from "../utils/research-panel-model";

export function useResearchPanelState({
  artifacts,
  runs,
}: {
  artifacts: ResearchArtifact[] | undefined;
  runs: ResearchRun[];
}) {
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [seenArtifactCount, setSeenArtifactCount] = useState(0);

  const selectedArtifactId = activeArtifactId ?? artifacts?.[0]?._id ?? null;
  const panelView = getResearchPanelViewState({
    artifacts,
    runs,
    rightPanelOpen,
    seenArtifactCount,
  });

  const openArtifact = (artifactId: string) => {
    setActiveArtifactId(artifactId);
    setSeenArtifactCount(panelView.artifactCount);
    setRightPanelOpen(true);
  };

  const setPanelOpen = (open: boolean) => {
    setRightPanelOpen(open);
    if (!open) {
      setSeenArtifactCount(panelView.artifactCount);
    }
  };

  return {
    selectedArtifactId,
    hasResearchPayload: panelView.hasResearchPayload,
    rightPanelOpen: panelView.rightPanelOpen,
    openArtifact,
    setPanelOpen,
  };
}
