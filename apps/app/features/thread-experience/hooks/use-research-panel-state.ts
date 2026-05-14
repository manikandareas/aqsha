import { useEffect, useRef, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import type { ResearchArtifact, ResearchRun, ResearchSource, SourceFocus } from "../types";
import { getResearchPanelViewState } from "../utils/research-panel-model";

const panelTabs = ["artifacts", "sources"] as const;
type PanelTab = (typeof panelTabs)[number];

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
  const [sourceFocus, setSourceFocus] = useState<SourceFocus | null>(null);
  const [seenArtifactCount, setSeenArtifactCount] = useState(0);
  const hasInitializedArtifactCount = useRef(false);
  const [panel, setPanel] = useQueryState(
    "panel",
    parseAsStringLiteral(panelTabs).withOptions({
      history: "replace",
      shallow: true,
    }),
  );

  const selectedArtifactId = activeArtifactId ?? artifacts?.[0]?._id ?? null;
  const panelView = getResearchPanelViewState({
    artifacts,
    runs,
    rightPanelOpen: panel !== null,
    seenArtifactCount,
  });
  const hasResearchPayload = panelView.hasResearchPayload || sources.length > 0;
  const activeTab: PanelTab = panel ?? "artifacts";
  const rightPanelOpen = hasResearchPayload && panel !== null;

  useEffect(() => {
    if (artifacts === undefined) {
      return;
    }
    if (!hasInitializedArtifactCount.current) {
      hasInitializedArtifactCount.current = true;
      setSeenArtifactCount(panelView.artifactCount);
      return;
    }
    if (!hasResearchPayload || !panelView.hasUnseenArtifact || panel !== null) {
      return;
    }
    void setPanel("artifacts");
  }, [
    artifacts,
    hasResearchPayload,
    panel,
    panelView.artifactCount,
    panelView.hasUnseenArtifact,
    setPanel,
  ]);

  const openArtifact = (artifactId: string) => {
    setActiveArtifactId(artifactId);
    setSeenArtifactCount(panelView.artifactCount);
    void setPanel("artifacts");
  };

  const openSources = (focus?: SourceFocus) => {
    setSourceFocus(focus ?? null);
    void setPanel("sources");
  };

  const setPanelOpen = (open: boolean) => {
    if (!open) {
      setSeenArtifactCount(panelView.artifactCount);
      void setPanel(null);
      return;
    }
    void setPanel((currentPanel) => currentPanel ?? "artifacts");
  };

  const setActiveTab = (tab: PanelTab) => {
    void setPanel(tab);
  };

  return {
    selectedArtifactId,
    activeTab,
    sourceFocus,
    hasResearchPayload,
    rightPanelOpen,
    openArtifact,
    openSources,
    setActiveTab,
    setPanelOpen,
  };
}
