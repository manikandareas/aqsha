"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DriveArtifactCard } from "@/components/drive-artifact-card";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { toArtifactIds } from "@/lib/convex-refs";
import { driveArtifactGridClass } from "@/lib/drive-grid";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import {
  threadContextScopeKey,
  useDraftContextSelection,
} from "@/lib/thread-context-draft-store";
import { cn } from "@/lib/utils";
import {
  useWorkspaceDriveData,
} from "@/features/workspaces/api/use-workspaces-data";
import { ContextPanelHeader } from "@/features/workspaces/components/context-panel-header";
import { WorkspaceDriveEmpty } from "@/features/workspaces/components/workspace-drive-empty";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";
import { useThreadExperienceData } from "../api/use-thread-experience-data";
import type {
  ContextCandidateArtifact,
} from "./component-types";
import { ThreadShellLayout } from "./thread-shell-layout";

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
  const workspaceDrive = useWorkspaceDriveData(selectedThread?.workspaceId ?? "");
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace._id, workspace.name])),
    [workspaces],
  );
  const workspaceName = selectedThread?.workspaceId
    ? (workspaceNameById.get(selectedThread.workspaceId) ?? "Workspace")
    : undefined;
  const contextArtifactTitleById = useMemo(() => {
    const titles = new Map<string, string>();
    for (const item of selectedContextArtifacts) {
      titles.set(String(item.artifactId), item.artifact.title);
    }
    for (const artifact of contextCandidateArtifacts) {
      titles.set(artifact._id, artifact.title);
    }
    for (const artifact of workspaceDrive.artifacts) {
      titles.set(artifact._id, artifact.title);
    }
    return titles;
  }, [contextCandidateArtifacts, selectedContextArtifacts, workspaceDrive.artifacts]);
  const draftContextArtifacts = useMemo(
    () =>
      draftContext.selectedIds.map((artifactId) => ({
        artifactId,
        title: contextArtifactTitleById.get(artifactId) ?? "Artifact",
      })),
    [contextArtifactTitleById, draftContext.selectedIds],
  );

  const sendMessageWithDraftContext = async (
    args: Parameters<typeof sendMessage>[0],
  ) => {
    const selectedContextArtifactIds = toArtifactIds(draftContext.selectedIds);
    const result = await sendMessage({
      ...args,
      selectedContextArtifactIds,
    });
    if (result.ok && threadId) {
      draftContext.markSelectionPersisted(draftContext.selectedIds);
    }
    return result;
  };

  const handleDeleteThread = async () => {
    if (!threadId) return;
    const destination = selectedThread?.workspaceId
      ? `/workspaces/${selectedThread.workspaceId}`
      : "/";
    await removeThread({ threadId });
    router.replace(destination);
  };

  const sidePanel =
    threadId && selectedThread != null ? (
      <ResponsiveSidePanel open={contextPanelOpen}>
        {selectedThread.workspaceId ? (
          <ThreadWorkspaceLibraryPanel
            workspaceId={selectedThread.workspaceId}
            workspaceName={workspaceName ?? "Workspace"}
            selectedIds={draftContext.selectedIdSet}
            onToggle={draftContext.toggleArtifact}
          />
        ) : (
          <ThreadGlobalContextPanel
            candidates={contextCandidateArtifacts}
            selectedIds={draftContext.selectedIdSet}
            onToggle={draftContext.toggleArtifact}
          />
        )}
      </ResponsiveSidePanel>
    ) : undefined;

  return (
    <SidebarProvider className="min-h-svh overflow-hidden">
      <ThreadShellLayout
        viewer={viewer}
        workspaces={workspaces}
        threads={threads}
        selectedThreadId={threadId}
        onCreateThread={() => router.push("/")}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        rateStatus={rateStatus}
        startThread={startThread}
        sendMessage={sendMessageWithDraftContext}
        runs={runs}
        artifacts={artifacts}
        sources={sources}
        rightPanelOpen={contextPanelOpen}
        onRightPanelOpenChange={setContextPanelOpen}
        onCancelRun={cancelRun}
        onDeleteThread={threadId ? handleDeleteThread : undefined}
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
}: {
  workspaceId: string;
  workspaceName: string;
  selectedIds: Set<string>;
  onToggle: (artifactId: string) => void;
}) {
  const router = useRouter();
  const drive = useWorkspaceDriveData(workspaceId);
  const dialogState = useWorkspaceLibraryDialogState();
  const [activeFolderId, setActiveFolderId] = useState<"root" | string>("root");

  if (drive.isLoading) {
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
      drive={drive}
      dialogState={dialogState}
      activeFolderId={activeFolderId}
      onActiveFolderChange={setActiveFolderId}
      isArtifactSelected={(artifactId) => selectedIds.has(artifactId)}
      onToggleArtifactContext={onToggle}
      onAfterArchive={() => router.push("/workspaces")}
      showCreateActions
      showWorkspaceSettings
    />
  );
}

function ThreadGlobalContextPanel({
  candidates,
  selectedIds,
  onToggle,
}: {
  candidates: ContextCandidateArtifact[];
  selectedIds: Set<string>;
  onToggle: (artifactId: string) => void;
}) {
  const closePanel = useCloseRightPanel();
  const isEmpty = candidates.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ContextPanelHeader title="Konteks riset" onClose={closePanel} />
      <div className={cn("min-h-0 flex-1 overflow-y-auto bg-background", panelBodyPaddingClass)}>
        {isEmpty ? (
          <WorkspaceDriveEmpty
            variant="root"
            title="Belum ada artifact"
            description="Belum ada artifact yang bisa dipilih untuk thread global."
            showActions={false}
          />
        ) : (
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className={driveArtifactGridClass}>
              {candidates.map((artifact) => (
                <DriveArtifactCard
                  key={artifact._id}
                  title={artifact.title}
                  kind={artifact.kind}
                  plainTextPreview={artifact.plainTextPreview}
                  isSelected={selectedIds.has(artifact._id)}
                  onClick={() => onToggle(artifact._id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
