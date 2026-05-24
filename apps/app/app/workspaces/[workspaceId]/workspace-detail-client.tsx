"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { useSidebar } from "@/components/ui/sidebar";
import { toArtifactIds, toWorkspaceId } from "@/lib/convex-refs";
import type { StartThread } from "@/features/thread-experience/components/component-types";
import {
  useWorkspaceDetailData,
  type WorkspaceDriveData,
} from "@/features/workspaces/api/use-workspaces-data";
import {
  WorkspaceChatSidePanel,
  WorkspaceLoading,
  WorkspaceMissing,
} from "@/features/workspaces/components/workspace-chat-side-panel";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceDraftContext } from "@/features/workspaces/hooks/use-workspace-draft-context";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";

export function WorkspaceDetailClient({ workspaceId }: { workspaceId: string }) {
  const data = useWorkspaceDetailData(workspaceId);

  return (
    <WorkspaceShell
      viewer={data.viewer}
      workspaces={data.workspaces}
      selectedWorkspaceId={workspaceId}
      threads={data.threads}
      createWorkspace={data.createWorkspace}
    >
      <WorkspaceDetailMain workspaceId={workspaceId} data={data} />
    </WorkspaceShell>
  );
}

function WorkspaceDetailMain({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: ReturnType<typeof useWorkspaceDetailData>;
}) {
  const router = useRouter();
  const dialogState = useWorkspaceLibraryDialogState();
  const draftContext = useWorkspaceDraftContext(workspaceId);
  const leftSidebar = useSidebar();
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [panelThreadId, setPanelThreadId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<"root" | string>("root");

  const contextArtifacts = useMemo(
    () =>
      data.artifacts
        .filter((artifact) => draftContext.selectedIds.has(artifact._id))
        .map((artifact) => ({ artifactId: artifact._id, title: artifact.title })),
    [data.artifacts, draftContext.selectedIds],
  );

  const applyDraftContextToThread = async (threadId: string) => {
    if (draftContext.selectedIds.size === 0) return;
    await data.addThreadContextArtifacts({
      threadId,
      artifactIds: toArtifactIds(draftContext.selectedIds),
    });
    draftContext.clear();
  };

  const handleStartThread: StartThread = async (args) => {
    const result = await data.startThread({
      ...args,
      workspaceId: toWorkspaceId(workspaceId),
    });
    if (result.ok && result.threadId && draftContext.selectedCount > 0) {
      await applyDraftContextToThread(result.threadId);
    }
    return result;
  };

  const handlePanelThreadChange = (threadId: string | null) => {
    setPanelThreadId(threadId);
    if (threadId !== null) {
      setChatPanelOpen(true);
    }
  };

  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  const drive: WorkspaceDriveData = data;

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      {data.isLoading ? (
        <WorkspaceLoading />
      ) : data.workspace === null ? (
        <WorkspaceMissing />
      ) : data.workspace ? (
        <DetailSplitLayout
          sideOpen={chatPanelOpen}
          onSideOpenChange={setChatPanelOpen}
          main={
            <WorkspaceLibrarySurface
              workspaceId={workspaceId}
              workspaceName={data.workspace.name}
              drive={drive}
              dialogState={dialogState}
              activeFolderId={activeFolderId}
              onActiveFolderChange={setActiveFolderId}
              isArtifactSelected={draftContext.isSelected}
              onToggleArtifactContext={draftContext.toggleArtifact}
              onAfterArchive={() => router.push("/workspaces")}
              chatPanelOpen={chatPanelOpen}
              onToggleChatPanel={() => setChatPanelOpen((open) => !open)}
              showLeftSidebarTrigger={!isLeftSidebarOpen}
              onToggleLeftSidebar={leftSidebar.toggleSidebar}
            />
          }
          side={
            <ResponsiveSidePanel open={chatPanelOpen}>
              <WorkspaceChatSidePanel
                workspaceName={data.workspace.name}
                activeThreadId={panelThreadId}
                onActiveThreadIdChange={handlePanelThreadChange}
                threads={data.workspaceThreads}
                contextArtifacts={contextArtifacts}
                onRemoveContextArtifact={draftContext.toggleArtifact}
                rateStatus={data.rateStatus}
                startThread={handleStartThread}
                removeThread={data.removeThread}
              />
            </ResponsiveSidePanel>
          }
        />
      ) : null}
    </main>
  );
}
