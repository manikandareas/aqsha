"use client";

import { buildWorkspaceMentionLabel, type ContextRef } from "@aqsha/chat-core";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { useSidebar } from "@/components/ui/sidebar";
import {
  ComposerMentionsProvider,
  usePanelContextSelection,
} from "@/features/thread-experience/components/composer-context-mentions";
import {
  useWorkspaceDetailData,
  type WorkspaceLibraryData,
} from "@/features/workspaces/api/use-workspaces-data";
import { AppLoadingOverlay } from "@/components/app-loading-overlay";
import { WorkspaceMissing } from "@/features/workspaces/components/workspace-chat-side-panel";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { WorkspaceSidePanel } from "@/features/workspaces/components/workspace-side-panel";
import {
  useWorkspacePanel,
  WorkspacePanelProvider,
} from "@/features/workspaces/components/workspace-panel-context";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";

export function WorkspaceDetailClient({ workspaceId }: { workspaceId: string }) {
  const data = useWorkspaceDetailData(workspaceId);

  return (
    <WorkspacePanelProvider>
      <WorkspaceDetailMain workspaceId={workspaceId} data={data} />
    </WorkspacePanelProvider>
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
  const leftSidebar = useSidebar();
  // Buka/tutup panel diturunkan dari nuqs `panel` (WorkspacePanelProvider) —
  // menggantikan state lokal `chatPanelOpen` (deep link `?panel=cite` jalan).
  const panel = useWorkspacePanel();
  const [panelThreadId, setPanelThreadId] = useState<string | null>(null);

  // Auto-mention: workspace yang sedang dibuka → token `@Workspace` di composer panel chat.
  const workspaceName = data.workspace?.name;
  const ambientContextRefs = useMemo<ContextRef[]>(
    () =>
      workspaceName
        ? [{ kind: "workspace", workspaceId, label: buildWorkspaceMentionLabel(workspaceName) }]
        : [],
    [workspaceId, workspaceName],
  );

  const handlePanelThreadChange = (threadId: string | null) => {
    setPanelThreadId(threadId);
    if (threadId !== null) {
      panel.openChat();
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
          ambientContextRefs={ambientContextRefs}
        >
          <DetailSplitLayout
            sideOpen={panel.isOpen}
            onSideOpenChange={panel.setOpen}
            main={
              <WorkspaceLibraryMain
                workspaceId={workspaceId}
                workspaceName={data.workspace.name}
                libraryData={data}
                panelOpen={panel.isOpen}
                onOpenPanel={() => panel.setOpen(true)}
                showLeftSidebarTrigger={!isLeftSidebarOpen}
                onToggleLeftSidebar={leftSidebar.toggleSidebar}
                onAfterArchive={() => router.push("/app/workspaces")}
              />
            }
            side={
              <ResponsiveSidePanel open={panel.isOpen}>
                <WorkspaceSidePanel
                  workspaceId={workspaceId}
                  activeThreadId={panelThreadId}
                  onActiveThreadIdChange={handlePanelThreadChange}
                  threads={data.workspaceThreads}
                  rateStatus={data.rateStatus}
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
  panelOpen,
  onOpenPanel,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  onAfterArchive,
}: {
  workspaceId: string;
  workspaceName: string;
  libraryData: WorkspaceLibraryData;
  panelOpen: boolean;
  onOpenPanel: () => void;
  showLeftSidebarTrigger: boolean;
  onToggleLeftSidebar: () => void;
  onAfterArchive: () => void;
}) {
  const dialogState = useWorkspaceLibraryDialogState();
  const titleById = (() => {
    const map = new Map<string, string>();
    for (const artifact of libraryData.artifacts) {
      map.set(artifact._id, artifact.title);
    }
    return map;
  })();
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
      contextCount={contextSelection.contextCount}
      onAfterArchive={onAfterArchive}
      chatPanelOpen={panelOpen}
      onToggleChatPanel={onOpenPanel}
      showLeftSidebarTrigger={showLeftSidebarTrigger}
      onToggleLeftSidebar={onToggleLeftSidebar}
    />
  );
}
