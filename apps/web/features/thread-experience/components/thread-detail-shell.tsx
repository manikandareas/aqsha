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
import { SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import {
  threadContextScopeKey,
  useDraftContextSelection,
} from "@/lib/thread-context-draft-store";
import { cn } from "@/lib/utils";
import {
  useWorkspaceLibraryData,
} from "@/features/workspaces/api/use-workspaces-data";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { WorkspaceBoardToolbar } from "@/features/workspaces/components/workspace-board-toolbar";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";
import { useThreadExperienceData } from "../api/use-thread-experience-data";
import type {
  SendMessage,
  StartThread,
} from "./component-types";
import { ThreadShellLayout } from "./thread-shell-layout";
import {
  buildContextArtifactSnapshot,
  toMutationContextSnapshot,
  toSelectedContextArtifactIds,
} from "../utils/message-context";

export function ThreadDetailShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const {
    viewer,
    workspaces,
    threads,
    selectedThread,
    selectedContextArtifacts,
    selectedContextArtifactsLoaded,
    contextCandidateArtifacts,
    createWorkspace,
    startThread,
    sendMessage,
    rateStatus,
    runs,
    artifacts,
    sources,
    cancelRun,
    removeThread,
  } = useThreadExperienceData(threadId);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const persistedContextIds = useMemo(
    () => selectedContextArtifacts.map((item) => String(item.artifactId)),
    [selectedContextArtifacts],
  );
  const draftContext = useDraftContextSelection(
    threadId ? threadContextScopeKey(threadId) : "thread:new",
    threadId && selectedContextArtifactsLoaded ? persistedContextIds : undefined,
  );
  const panelWorkspaceId = selectedThread?.workspaceId;
  const workspaceLibrary = useWorkspaceLibraryData(panelWorkspaceId ?? "");
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace._id, workspace.name])),
    [workspaces],
  );
  const workspaceName = panelWorkspaceId
    ? (workspaceNameById.get(panelWorkspaceId) ?? "Workspace")
    : undefined;
  const contextArtifactTitleById = useMemo(() => {
    const titles = new Map<string, string>();
    for (const item of selectedContextArtifacts) {
      titles.set(String(item.artifactId), item.artifact.title);
    }
    for (const artifact of contextCandidateArtifacts) {
      titles.set(artifact._id, artifact.title);
    }
    for (const artifact of workspaceLibrary.artifacts) {
      titles.set(artifact._id, artifact.title);
    }
    return titles;
  }, [contextCandidateArtifacts, selectedContextArtifacts, workspaceLibrary.artifacts]);
  const draftContextArtifacts = useMemo(
    () =>
      draftContext.selectedIds.map((artifactId) => ({
        artifactId,
        title: contextArtifactTitleById.get(artifactId) ?? "Artifact",
      })),
    [contextArtifactTitleById, draftContext.selectedIds],
  );

  const sendMessageWithDraftContext: SendMessage = async (args) => {
    const shouldReplaceContext = draftContext.isDirty;
    const messageAttachmentIds = args.messageAttachmentArtifactIds?.map(String) ?? [];
    const panelIds = shouldReplaceContext ? draftContext.selectedIds : persistedContextIds;
    const snapshotIds = [...new Set([...panelIds, ...messageAttachmentIds])];
    const contextArtifactSnapshot = buildContextArtifactSnapshot(
      snapshotIds,
      contextArtifactTitleById,
      messageAttachmentIds,
    );
    const panelSnapshot = shouldReplaceContext
      ? buildContextArtifactSnapshot(
          draftContext.selectedIds,
          contextArtifactTitleById,
        )
      : undefined;
    const result = await sendMessage({
      ...args,
      selectedContextArtifactIds: toSelectedContextArtifactIds(panelSnapshot),
      contextArtifactSnapshot: toMutationContextSnapshot(contextArtifactSnapshot),
    });
    if (result.ok && threadId && shouldReplaceContext) {
      draftContext.markSelectionPersisted(draftContext.selectedIds);
    }
    return result;
  };

  const startThreadWithDraftContext: StartThread = async (args) => {
    const shouldIncludeContext = draftContext.isDirty;
    const messageAttachmentIds = args.messageAttachmentArtifactIds?.map(String) ?? [];
    const panelIds = shouldIncludeContext ? draftContext.selectedIds : [];
    const snapshotIds = [...new Set([...panelIds, ...messageAttachmentIds])];
    const contextArtifactSnapshot = buildContextArtifactSnapshot(
      snapshotIds,
      contextArtifactTitleById,
      messageAttachmentIds,
    );
    const panelSnapshot = shouldIncludeContext
      ? buildContextArtifactSnapshot(
          draftContext.selectedIds,
          contextArtifactTitleById,
        )
      : undefined;
    const result = await startThread({
      ...args,
      selectedContextArtifactIds: toSelectedContextArtifactIds(panelSnapshot),
      contextArtifactSnapshot: toMutationContextSnapshot(contextArtifactSnapshot),
    });
    if (result.ok && shouldIncludeContext) {
      draftContext.markSelectionPersisted(draftContext.selectedIds);
    }
    return result;
  };

  const handleDeleteThread = async () => {
    if (!threadId) return;
    const destination = selectedThread?.workspaceId
      ? `/app/workspaces/${selectedThread.workspaceId}`
      : "/";
    await removeThread({ threadId });
    router.replace(destination);
  };

  const sidePanelContent = !threadId
    ? (
        <ThreadGlobalContextPanel
          workspaces={workspaces}
          selectedIds={draftContext.selectedIdSet}
          onToggle={draftContext.toggleArtifact}
          onSetSelection={draftContext.setSelectedArtifacts}
        />
      )
    : selectedThread != null
      ? selectedThread.workspaceId
        ? (
            <ThreadWorkspaceLibraryPanel
              workspaceId={selectedThread.workspaceId}
              workspaceName={workspaceName ?? "Workspace"}
              selectedIds={draftContext.selectedIdSet}
              onToggle={draftContext.toggleArtifact}
              onSetSelection={draftContext.setSelectedArtifacts}
            />
          )
        : (
            <ThreadGlobalContextPanel
              workspaces={workspaces}
              selectedIds={draftContext.selectedIdSet}
              onToggle={draftContext.toggleArtifact}
              onSetSelection={draftContext.setSelectedArtifacts}
            />
          )
      : null;

  const sidePanel = sidePanelContent ? (
    <ResponsiveSidePanel open={contextPanelOpen}>{sidePanelContent}</ResponsiveSidePanel>
  ) : undefined;

  return (
    <SidebarProvider className="min-h-svh overflow-hidden">
      <ThreadShellLayout
        viewer={viewer}
        workspaces={workspaces}
        threads={threads}
        selectedThreadId={threadId}
        onCreateThread={() => router.push("/app")}
        onSelectThread={(id) => router.push(`/app/threads/${id}`)}
        createWorkspace={createWorkspace}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        rateStatus={rateStatus}
        startThread={startThreadWithDraftContext}
        sendMessage={sendMessageWithDraftContext}
        runs={runs}
        artifacts={artifacts}
        sources={sources}
        rightPanelOpen={contextPanelOpen}
        onRightPanelOpenChange={setContextPanelOpen}
        onCancelRun={cancelRun}
        onDeleteThread={threadId ? handleDeleteThread : undefined}
        removeThread={removeThread}
        sidePanel={sidePanel}
        contextArtifacts={draftContextArtifacts}
        onRemoveContextArtifact={draftContext.toggleArtifact}
      />
    </SidebarProvider>
  );
}

function ThreadWorkspaceLibraryPanel({
  workspaceId,
  workspaceName,
  selectedIds,
  onToggle,
  onSetSelection,
  titleSlot,
}: {
  workspaceId: string;
  workspaceName: string;
  selectedIds: Set<string>;
  onToggle: (artifactId: string) => void;
  onSetSelection: (artifactIds: string[]) => void;
  titleSlot?: ReactNode;
}) {
  const router = useRouter();
  const libraryData = useWorkspaceLibraryData(workspaceId);
  const dialogState = useWorkspaceLibraryDialogState();
  const [activeFolderId, setActiveFolderId] = useState<"root" | string>("root");

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
      activeFolderId={activeFolderId}
      onActiveFolderChange={setActiveFolderId}
      isArtifactSelected={(artifactId) => selectedIds.has(artifactId)}
      onToggleArtifactContext={onToggle}
      onSetArtifactContextSelection={onSetSelection}
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
  selectedIds,
  onToggle,
  onSetSelection,
}: {
  workspaces: WorkspacePickerOption[];
  selectedIds: Set<string>;
  onToggle: (artifactId: string) => void;
  onSetSelection: (artifactIds: string[]) => void;
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
        selectedIds={selectedIds}
        onToggle={onToggle}
        onSetSelection={onSetSelection}
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
        onRenameWorkspace={() => {}}
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
