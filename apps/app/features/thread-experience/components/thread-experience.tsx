"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useWorkspaceDriveData } from "@/features/workspaces/api/use-workspaces-data";
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
    selectedContextArtifacts,
    contextCandidateArtifacts,
    startThread,
    sendMessage,
    toggleThreadContextArtifact,
    rateStatus,
    runs,
    artifacts,
    sources,
    cancelRun,
  } = useThreadExperienceData(threadId);
  const boundWorkspaceId = selectedThread?.workspaceId;
  const workspaceDrive = useWorkspaceDriveData(boundWorkspaceId ?? "");
  const panelState = useResearchPanelState({
    artifacts,
    runs,
    sources,
  });
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
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
    <SidebarProvider className="min-h-svh overflow-hidden">
      <ThreadShellLayout
        viewer={viewer}
        workspaces={workspaces}
        workspaceDrive={boundWorkspaceId ? workspaceDrive : undefined}
        threads={threads}
        selectedThreadId={threadId}
        onCreateThread={handleCreateThread}
        hasResearchPayload={panelState.hasResearchPayload}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        selectedContextArtifacts={selectedContextArtifacts}
        contextCandidateArtifacts={contextCandidateArtifacts}
        toggleThreadContextArtifact={toggleThreadContextArtifact}
        rateStatus={rateStatus}
        startThread={startThread}
        sendMessage={sendMessage}
        runs={runs}
        artifacts={artifacts}
        sources={sources}
        activeArtifact={activeArtifact ?? null}
        activePanelTab={panelState.activeTab}
        sourceFocus={panelState.sourceFocus}
        rightPanelOpen={threadId ? contextPanelOpen : panelState.rightPanelOpen}
        onRightPanelOpenChange={threadId ? setContextPanelOpen : panelState.setPanelOpen}
        onOpenArtifact={panelState.openArtifact}
        onOpenSources={panelState.openSources}
        onPanelTabChange={panelState.setActiveTab}
        onCancelRun={handleCancelRun}
      />
    </SidebarProvider>
  );
}
