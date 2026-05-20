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
    workspaces,
    threads,
    selectedThread,
    startThread,
    sendMessage,
    rateStatus,
    runs,
    artifacts,
    sources,
    cancelRun,
  } = useThreadExperienceData(threadId);
  const panelState = useResearchPanelState({
    artifacts,
    runs,
    sources,
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
        workspaces={workspaces}
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
        runs={runs ?? []}
        artifacts={artifacts ?? []}
        sources={sources ?? []}
        activeArtifact={activeArtifact ?? null}
        activePanelTab={panelState.activeTab}
        sourceFocus={panelState.sourceFocus}
        rightPanelOpen={panelState.rightPanelOpen}
        onRightPanelOpenChange={panelState.setPanelOpen}
        onOpenArtifact={panelState.openArtifact}
        onOpenSources={panelState.openSources}
        onPanelTabChange={panelState.setActiveTab}
        onCancelRun={handleCancelRun}
      />
    </SidebarProvider>
  );
}
