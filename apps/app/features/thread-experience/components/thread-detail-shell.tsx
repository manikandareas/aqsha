"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DriveArtifactCard } from "@/components/drive-artifact-card";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { toArtifactId } from "@/lib/convex-refs";
import { driveArtifactGridClass } from "@/lib/drive-grid";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useWorkspaceDriveData } from "@/features/workspaces/api/use-workspaces-data";
import { ContextPanelHeader } from "@/features/workspaces/components/context-panel-header";
import { WorkspaceDriveEmpty } from "@/features/workspaces/components/workspace-drive-empty";
import { WorkspaceLibrarySurface } from "@/features/workspaces/components/workspace-library-surface";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";
import { useThreadExperienceData } from "../api/use-thread-experience-data";
import type {
  ContextCandidateArtifact,
  SelectedContextArtifact,
  ToggleThreadContextArtifact,
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
    contextCandidateArtifacts,
    startThread,
    sendMessage,
    toggleThreadContextArtifact,
    rateStatus,
    runs,
    artifacts,
    sources,
    cancelRun,
    removeThread,
  } = useThreadExperienceData(threadId);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
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
            threadId={threadId}
            workspaceId={selectedThread.workspaceId}
            workspaceName={workspaceName ?? "Workspace"}
            selected={selectedContextArtifacts}
            onToggle={toggleThreadContextArtifact}
          />
        ) : (
          <ThreadGlobalContextPanel
            threadId={threadId}
            candidates={contextCandidateArtifacts}
            selected={selectedContextArtifacts}
            onToggle={toggleThreadContextArtifact}
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
        sendMessage={sendMessage}
        runs={runs}
        artifacts={artifacts}
        sources={sources}
        rightPanelOpen={contextPanelOpen}
        onRightPanelOpenChange={setContextPanelOpen}
        onCancelRun={cancelRun}
        onDeleteThread={threadId ? handleDeleteThread : undefined}
        sidePanel={sidePanel}
      />
    </SidebarProvider>
  );
}

function ThreadWorkspaceLibraryPanel({
  threadId,
  workspaceId,
  workspaceName,
  selected,
  onToggle,
}: {
  threadId: string;
  workspaceId: string;
  workspaceName: string;
  selected: SelectedContextArtifact[];
  onToggle: ToggleThreadContextArtifact;
}) {
  const router = useRouter();
  const drive = useWorkspaceDriveData(workspaceId);
  const dialogState = useWorkspaceLibraryDialogState();
  const [activeFolderId, setActiveFolderId] = useState<"root" | string>("root");
  const selectedIds = useMemo(
    () => new Set(selected.map((item) => String(item.artifactId))),
    [selected],
  );

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
      onToggleArtifactContext={(artifactId) =>
        void onToggle({ threadId, artifactId: toArtifactId(artifactId) })
      }
      onAfterArchive={() => router.push("/workspaces")}
      showCreateActions
      showWorkspaceSettings
    />
  );
}

function ThreadGlobalContextPanel({
  threadId,
  candidates,
  selected,
  onToggle,
}: {
  threadId: string;
  candidates: ContextCandidateArtifact[];
  selected: SelectedContextArtifact[];
  onToggle: ToggleThreadContextArtifact;
}) {
  const closePanel = useCloseRightPanel();
  const selectedIds = useMemo(
    () => new Set(selected.map((item) => String(item.artifactId))),
    [selected],
  );
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
                  onClick={() => void onToggle({ threadId, artifactId: artifact._id })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
