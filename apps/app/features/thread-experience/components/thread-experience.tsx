"use client";

import { type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  useActiveArtifact,
  useThreadExperienceData,
} from "../api/use-thread-experience-data";
import { useResearchPanelState } from "../hooks/use-research-panel-state";
import { ThreadShellLayout } from "./thread-shell-layout";

export function ThreadExperience({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const {
    viewer,
    threads,
    selectedThread,
    startThread,
    sendMessage,
    rateStatus,
    sources,
    runs,
    artifacts,
    cancelRun,
    retryRun,
  } = useThreadExperienceData(threadId);
  const panelState = useResearchPanelState({
    hasSources: sources.length > 0,
    artifacts,
    runs,
  });
  const activeArtifact = useActiveArtifact(panelState.selectedArtifactId);
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const handleCreateThread = () => {
    router.push("/");
  };

  const handleCancelRun = async (runId: string) => {
    try {
      await cancelRun({ runId: runId as never });
    } catch (error) {
      console.error("Failed to cancel deep research run", error);
    }
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16.5rem",
          "--sidebar-width-mobile": "17.5rem",
        } as CSSProperties
      }
      className="h-svh max-h-svh overflow-hidden"
    >
      <ThreadShellLayout
        viewer={viewer}
        threads={threads}
        selectedThreadId={threadId}
        onCreateThread={handleCreateThread}
        hasResearchPayload={panelState.hasResearchPayload}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        rateStatus={rateStatus}
        startThread={startThread}
        sendMessage={sendMessage}
        sources={sources ?? []}
        runs={runs ?? []}
        artifacts={artifacts ?? []}
        activeArtifact={activeArtifact ?? null}
        activeCitation={panelState.activeCitation}
        onCitationClick={panelState.setActiveCitation}
        rightPanelOpen={panelState.rightPanelOpen}
        rightPanelTab={panelState.rightPanelTab}
        onRightPanelOpenChange={panelState.setPanelOpen}
        onRightPanelTabChange={panelState.setPanelTab}
        onOpenArtifact={panelState.openArtifact}
        onCancelRun={handleCancelRun}
        onRetryRun={(runId) => retryRun({ runId: runId as never })}
      />
    </SidebarProvider>
  );
}
