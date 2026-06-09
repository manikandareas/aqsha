"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { useSidebar } from "@/components/ui/sidebar";
import { toWorkspaceId } from "@/lib/convex-refs";
import type { StartThread } from "@/features/thread-experience/components/component-types";
import {
  ComposerMentionsProvider,
  usePanelContextSelection,
} from "@/features/thread-experience/components/composer-context-mentions";
import { toMutationContextSnapshot } from "@/features/thread-experience/utils/message-context";
import {
  useWorkspaceDetailData,
  type WorkspaceLibraryData,
} from "@/features/workspaces/api/use-workspaces-data";
import { AppLoadingOverlay } from "@/components/app-loading-overlay";
import {
  WorkspaceChatSidePanel,
  WorkspaceMissing,
} from "@/features/workspaces/components/workspace-chat-side-panel";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";

export function WorkspaceDetailClient({ workspaceId }: { workspaceId: string }) {
  const data = useWorkspaceDetailData(workspaceId);

  return <WorkspaceDetailMain workspaceId={workspaceId} data={data} />;
}

function WorkspaceDetailMain({
  workspaceId,
  data,
}: {
  workspaceId: string;
  data: ReturnType<typeof useWorkspaceDetailData>;
}) {
  const router = useRouter();
  const leftSidebar = useSidebar();
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [panelThreadId, setPanelThreadId] = useState<string | null>(null);

  // The thread is filed under this workspace ("disimpan di"); the workspace also
  // pre-seeds as an inline context pill via the mention provider. The composer
  // supplies the pinned context refs; we just brand the snapshot here.
  const handleStartThread: StartThread = (args) =>
    data.startThread({
      ...args,
      workspaceId: toWorkspaceId(workspaceId),
      contextArtifactSnapshot: toMutationContextSnapshot(args.contextArtifactSnapshot),
    });

  const handlePanelThreadChange = (threadId: string | null) => {
    setPanelThreadId(threadId);
    if (threadId !== null) {
      setChatPanelOpen(true);
    }
  };

  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      {data.isLoading ? (
        <AppLoadingOverlay variant="absolute" />
      ) : data.workspace === null ? (
        <WorkspaceMissing />
      ) : data.workspace ? (
        <ComposerMentionsProvider
          threadId={panelThreadId ?? undefined}
          ambientWorkspaceId={workspaceId}
        >
          <DetailSplitLayout
            sideOpen={chatPanelOpen}
            onSideOpenChange={setChatPanelOpen}
            main={
              <WorkspaceLibraryMain
                workspaceId={workspaceId}
                workspaceName={data.workspace.name}
                libraryData={data}
                chatPanelOpen={chatPanelOpen}
                onToggleChatPanel={() => setChatPanelOpen((open) => !open)}
                showLeftSidebarTrigger={!isLeftSidebarOpen}
                onToggleLeftSidebar={leftSidebar.toggleSidebar}
                onAfterArchive={() => router.push("/app/workspaces")}
              />
            }
            side={
              <ResponsiveSidePanel open={chatPanelOpen}>
                <WorkspaceChatSidePanel
                  workspaceId={workspaceId}
                  activeThreadId={panelThreadId}
                  onActiveThreadIdChange={handlePanelThreadChange}
                  threads={data.workspaceThreads}
                  rateStatus={data.rateStatus}
                  startThread={handleStartThread}
                  removeThread={data.removeThread}
                />
              </ResponsiveSidePanel>
            }
          />
        </ComposerMentionsProvider>
      ) : null}
    </main>
  );
}

function WorkspaceLibraryMain({
  workspaceId,
  workspaceName,
  libraryData,
  chatPanelOpen,
  onToggleChatPanel,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  onAfterArchive,
}: {
  workspaceId: string;
  workspaceName: string;
  libraryData: WorkspaceLibraryData;
  chatPanelOpen: boolean;
  onToggleChatPanel: () => void;
  showLeftSidebarTrigger: boolean;
  onToggleLeftSidebar: () => void;
  onAfterArchive: () => void;
}) {
  const dialogState = useWorkspaceLibraryDialogState();
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const artifact of libraryData.artifacts) {
      map.set(artifact._id, artifact.title);
    }
    return map;
  }, [libraryData.artifacts]);
  const contextSelection = usePanelContextSelection({
    workspaceId,
    workspaceName,
    titleById,
  });

  return (
    <WorkspaceLibrarySurface
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      libraryData={libraryData}
      dialogState={dialogState}
      getArtifactSelected={contextSelection.getArtifactSelected}
      onToggleArtifactContext={contextSelection.onToggleArtifactContext}
      onSetArtifactContextSelection={contextSelection.onSetArtifactContextSelection}
      onAfterArchive={onAfterArchive}
      chatPanelOpen={chatPanelOpen}
      onToggleChatPanel={onToggleChatPanel}
      showLeftSidebarTrigger={showLeftSidebarTrigger}
      onToggleLeftSidebar={onToggleLeftSidebar}
    />
  );
}
