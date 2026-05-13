import { useState } from "react";
import type { ResearchArtifact, ResearchRun, ResearchSource, SourceFocus } from "../types";
import { getResearchPanelViewState } from "../utils/research-panel-model";

export function useResearchPanelState({
  artifacts,
  runs,
  sources,
}: {
  artifacts: ResearchArtifact[] | undefined;
  runs: ResearchRun[];
  sources: ResearchSource[];
}) {
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"artifacts" | "sources">("artifacts");
  const [sourceFocus, setSourceFocus] = useState<SourceFocus | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [seenArtifactCount, setSeenArtifactCount] = useState(0);

  const selectedArtifactId = activeArtifactId ?? artifacts?.[0]?._id ?? null;
  const panelView = getResearchPanelViewState({
    artifacts,
    runs,
    rightPanelOpen,
    seenArtifactCount,
  });
  const hasResearchPayload = panelView.hasResearchPayload || sources.length > 0;

  const openArtifact = (artifactId: string) => {
    setActiveArtifactId(artifactId);
    setActiveTab("artifacts");
    setSeenArtifactCount(panelView.artifactCount);
    setRightPanelOpen(true);
  };

  const openSources = (focus?: SourceFocus) => {
    setSourceFocus(focus ?? null);
    setActiveTab("sources");
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
    activeTab,
    sourceFocus,
    hasResearchPayload,
    rightPanelOpen: hasResearchPayload && (rightPanelOpen || panelView.hasUnseenArtifact),
    openArtifact,
    openSources,
    setActiveTab,
    setPanelOpen,
  };
}
