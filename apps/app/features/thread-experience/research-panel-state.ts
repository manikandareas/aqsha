import { useState } from "react";
import type { ResearchArtifact, ResearchRun } from "./types";
import { isRunActive } from "./transcript-model";

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
  const artifactCount = artifacts?.length ?? 0;
  const hasResearchPayload =
    hasSources ||
    artifactCount > 0 ||
    runs.some(isRunActive);
  const hasUnseenArtifact = artifactCount > seenArtifactCount;
  const effectiveRightPanelTab = hasUnseenArtifact ? "artifacts" : rightPanelTab;
  const effectiveRightPanelOpen =
    hasResearchPayload && (rightPanelOpen || hasUnseenArtifact);

  const openArtifact = (artifactId: string) => {
    setActiveArtifactId(artifactId);
    setRightPanelTab("artifacts");
    setSeenArtifactCount(artifactCount);
    setRightPanelOpen(true);
  };

  const setPanelOpen = (open: boolean) => {
    setRightPanelOpen(open);
    if (!open) {
      setSeenArtifactCount(artifactCount);
    }
  };

  const setPanelTab = (tab: "sources" | "artifacts") => {
    setRightPanelTab(tab);
    setSeenArtifactCount(artifactCount);
  };

  return {
    activeCitation,
    setActiveCitation,
    selectedArtifactId,
    hasResearchPayload,
    rightPanelOpen: effectiveRightPanelOpen,
    rightPanelTab: effectiveRightPanelTab,
    openArtifact,
    setPanelOpen,
    setPanelTab,
  };
}
