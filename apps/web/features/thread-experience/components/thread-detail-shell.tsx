"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { PanelBoardTitleDropdownTrigger } from "@/components/panel-title-dropdown-trigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import {
  useWorkspaceLibraryData,
} from "@/features/workspaces/api/use-workspaces-data";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { WorkspaceBoardToolbar } from "@/features/workspaces/components/workspace-board-toolbar";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";
import { useThreadExperienceData } from "../api/use-thread-experience-data";
import {
  ComposerMentionsProvider,
  usePanelContextSelection,
} from "./composer-context-mentions";
import { ThreadShellLayout } from "./thread-shell-layout";

export function ThreadDetailShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const {
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
    retryRun,
    removeThread,
  } = useThreadExperienceData(threadId);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const handleDeleteThread = async () => {
    if (!threadId) return;
    const destination = selectedThread?.workspaceId
      ? `/app/workspaces/${selectedThread.workspaceId}`
      : "/";
    await removeThread({ threadId });
    router.replace(destination);
  };

  const workspaceNameById = new Map(workspaces.map((workspace) => [workspace._id, workspace.name]));
  const panelWorkspaceId = selectedThread?.workspaceId;
  const workspaceName = panelWorkspaceId
    ? (workspaceNameById.get(panelWorkspaceId) ?? "Workspace")
    : undefined;

  const sidePanelContent = !threadId
    ? <ThreadGlobalContextPanel workspaces={workspaces} />
    : selectedThread != null
      ? selectedThread.workspaceId
        ? (
            <ThreadWorkspaceLibraryPanel
              workspaceId={selectedThread.workspaceId}
              workspaceName={workspaceName ?? "Workspace"}
            />
          )
        : <ThreadGlobalContextPanel workspaces={workspaces} />
      : null;

  const sidePanel = sidePanelContent ? (
    <ResponsiveSidePanel open={contextPanelOpen}>{sidePanelContent}</ResponsiveSidePanel>
  ) : undefined;

  return (
    <ComposerMentionsProvider
      threadId={threadId}
      ambientWorkspaceId={selectedThread?.workspaceId ?? null}
    >
      <ThreadShellLayout
        threads={threads}
        onCreateThread={() => router.push("/app")}
        onSelectThread={(id) => router.push(`/app/threads/${id}`)}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        rateStatus={rateStatus}
        startThread={startThread}
        sendMessage={sendMessage}
        runs={runs}
        artifacts={artifacts}
        sources={sources}
        rightPanelOpen={contextPanelOpen}
        onRightPanelOpenChange={setContextPanelOpen}
        onCancelRun={cancelRun}
        onRetryRun={retryRun}
        onDeleteThread={threadId ? handleDeleteThread : undefined}
        sidePanel={sidePanel}
      />
    </ComposerMentionsProvider>
  );
}

function ThreadWorkspaceLibraryPanel({
  workspaceId,
  workspaceName,
  titleSlot,
}: {
  workspaceId: string;
  workspaceName: string;
  titleSlot?: ReactNode;
}) {
  const router = useRouter();
  const libraryData = useWorkspaceLibraryData(workspaceId);
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

  if (libraryData.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className={cn("grid gap-3", panelBodyPaddingClass)}>
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLibrarySurface
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      titleSlot={titleSlot}
      libraryData={libraryData}
      dialogState={dialogState}
      getArtifactSelected={contextSelection.getArtifactSelected}
      onToggleArtifactContext={contextSelection.onToggleArtifactContext}
      onSetArtifactContextSelection={contextSelection.onSetArtifactContextSelection}
      onAfterArchive={() => router.push("/app/workspaces")}
      showCreateActions
      showWorkspaceSettings
    />
  );
}

type WorkspacePickerOption = {
  _id: string;
  name: string;
};

function WorkspacePanelSwitcher({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  placeholder = "Pilih workspace",
}: {
  workspaces: WorkspacePickerOption[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  placeholder?: string;
}) {
  const label = selectedWorkspaceId
    ? (workspaces.find((workspace) => workspace._id === selectedWorkspaceId)?.name ?? placeholder)
    : placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PanelBoardTitleDropdownTrigger>{label}</PanelBoardTitleDropdownTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
        {workspaces.length === 0 ? (
          <DropdownMenuItem disabled>Belum ada workspace</DropdownMenuItem>
        ) : (
          workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace._id}
              onClick={() => onSelectWorkspace(workspace._id)}
            >
              <span className="truncate">{workspace.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThreadGlobalContextPanel({
  workspaces,
}: {
  workspaces: WorkspacePickerOption[];
}) {
  const closePanel = useCloseRightPanel();
  const [selectedPanelWorkspaceId, setSelectedPanelWorkspaceId] = useState<string | null>(null);
  const selectedWorkspaceName = selectedPanelWorkspaceId
    ? (workspaces.find((workspace) => workspace._id === selectedPanelWorkspaceId)?.name ?? "Workspace")
    : null;

  const workspaceSwitcher = (
    <WorkspacePanelSwitcher
      workspaces={workspaces}
      selectedWorkspaceId={selectedPanelWorkspaceId}
      onSelectWorkspace={setSelectedPanelWorkspaceId}
    />
  );

  if (selectedPanelWorkspaceId && selectedWorkspaceName) {
    return (
      <ThreadWorkspaceLibraryPanel
        workspaceId={selectedPanelWorkspaceId}
        workspaceName={selectedWorkspaceName}
        titleSlot={workspaceSwitcher}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceBoardToolbar
        workspaceName="Workspace"
        titleSlot={workspaceSwitcher}
        breadcrumb={[{ id: "root", label: "Root" }]}
        onNavigate={() => {}}
        onCreateFolder={() => {}}
        onCreateDocument={() => {}}
        onCreateUrl={() => {}}
        onRenameWorkspace={async () => {}}
        onUpdateWorkspaceEmoji={async () => {}}
        onArchiveWorkspace={() => {}}
        onClosePanel={closePanel}
        showCreateActions={false}
        showWorkspaceSettings={false}
      />
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background",
          panelBodyPaddingClass,
        )}
      >
        <p className="text-center text-[13px] font-medium text-muted-foreground">
          Silakan pilih workspace terlebih dahulu.
        </p>
      </div>
    </div>
  );
}
