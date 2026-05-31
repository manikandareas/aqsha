"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { useSidebar } from "@/components/ui/sidebar";
import { toWorkspaceId } from "@/lib/convex-refs";
import type { StartThread } from "@/features/thread-experience/components/component-types";
import {
  buildContextArtifactSnapshot,
  toMutationContextSnapshot,
  toSelectedContextArtifactIds,
} from "@/features/thread-experience/utils/message-context";
import {
  useWorkspaceDetailData,
  type WorkspaceLibraryData,
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
      removeThread={data.removeThread}
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

  const contextArtifacts = data.artifacts.flatMap((artifact) =>
    draftContext.selectedIdSet.has(artifact._id)
      ? [{ artifactId: artifact._id, title: artifact.title }]
      : [],
  );

  const handleStartThread: StartThread = async (args) => {
    const shouldIncludeContext = draftContext.isDirty;
    const messageAttachmentIds = args.messageAttachmentArtifactIds?.map(String) ?? [];
    const panelIds = shouldIncludeContext
      ? [...new Set([...draftContext.selectedIds, ...messageAttachmentIds.map(String)])]
      : messageAttachmentIds;
    const titleById = new Map(
      data.artifacts.map((artifact) => [artifact._id, artifact.title]),
    );
    const contextArtifactSnapshot = buildContextArtifactSnapshot(
      panelIds,
      titleById,
      messageAttachmentIds,
    );
    const panelSnapshot = shouldIncludeContext
      ? buildContextArtifactSnapshot(
          draftContext.selectedIds,
          titleById,
        )
      : undefined;
    const result = await data.startThread({
      ...args,
      workspaceId: toWorkspaceId(workspaceId),
      selectedContextArtifactIds: toSelectedContextArtifactIds(panelSnapshot),
      contextArtifactSnapshot: toMutationContextSnapshot(contextArtifactSnapshot),
    });
    if (result.ok && result.threadId && shouldIncludeContext) {
      draftContext.markSelectionPersisted(draftContext.selectedIds);
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

  const libraryData: WorkspaceLibraryData = data;

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
              libraryData={libraryData}
              dialogState={dialogState}
              activeFolderId={activeFolderId}
              onActiveFolderChange={setActiveFolderId}
              getArtifactSelected={draftContext.isSelected}
              onToggleArtifactContext={draftContext.toggleArtifact}
              onSetArtifactContextSelection={draftContext.setSelectedArtifacts}
              onAfterArchive={() => router.push("/app/workspaces")}
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
                workspaceId={workspaceId}
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
