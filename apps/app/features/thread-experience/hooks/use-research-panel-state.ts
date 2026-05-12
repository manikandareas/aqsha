import { useState } from "react";
import type { ResearchArtifact, ResearchRun } from "../types";
import { getResearchPanelViewState } from "../utils/research-panel-model";

export function useResearchPanelState({
  hasSources,
  artifacts,
  runs,
}: {
  hasSources: boolean;
  artifacts: ResearchArtifact[] | undefined;
  runs: ResearchRun[];
}) {
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<"sources" | "artifacts">(
    "sources",
  );
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [seenArtifactCount, setSeenArtifactCount] = useState(0);

  const selectedArtifactId = activeArtifactId ?? artifacts?.[0]?._id ?? null;
  const panelView = getResearchPanelViewState({
    hasSources,
    artifacts,
    runs,
    rightPanelOpen,
    rightPanelTab,
    seenArtifactCount,
  });

  const openArtifact = (artifactId: string) => {
    setActiveArtifactId(artifactId);
    setRightPanelTab("artifacts");
    setSeenArtifactCount(panelView.artifactCount);
    setRightPanelOpen(true);
  };

  const setPanelOpen = (open: boolean) => {
    setRightPanelOpen(open);
    if (!open) {
      setSeenArtifactCount(panelView.artifactCount);
    }
  };

  const setPanelTab = (tab: "sources" | "artifacts") => {
    setRightPanelTab(tab);
    setSeenArtifactCount(panelView.artifactCount);
  };

  return {
    activeCitation,
    setActiveCitation,
    selectedArtifactId,
    hasResearchPayload: panelView.hasResearchPayload,
    rightPanelOpen: panelView.rightPanelOpen,
    rightPanelTab: panelView.rightPanelTab,
    openArtifact,
    setPanelOpen,
    setPanelTab,
  };
}
