"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sidebar, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { DriveArtifactCard } from "@/components/drive-artifact-card";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { driveArtifactGridClass } from "@/lib/drive-grid";
import { panelBodyPaddingClass, panelSurfaceClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { WorkspaceDriveData } from "@/features/workspaces/api/use-workspaces-data";
import { toArtifactId, toWorkspaceFolderId } from "@/lib/convex-refs";
import { WorkspaceBoardToolbar } from "@/features/workspaces/components/workspace-board-toolbar";
import { WorkspaceDriveEmpty } from "@/features/workspaces/components/workspace-drive-empty";
import { WorkspaceDriveLibrary } from "@/features/workspaces/components/workspace-drive-library";
import { WorkspaceLibraryDialogsStack } from "@/features/workspaces/components/workspace-library-dialogs-stack";
import { useWorkspaceLibraryDialogState } from "@/features/workspaces/hooks/use-workspace-library-dialogs";
import type {
  ContextCandidateArtifact,
  SelectedContextArtifact,
  ToggleThreadContextArtifact,
} from "./component-types";

export function ThreadContextPanel({
  threadId,
  workspaceId,
  workspaceName,
  workspaceDrive,
  candidates,
  selected,
  onToggle,
}: {
  threadId: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceDrive?: WorkspaceDriveData;
  candidates: ContextCandidateArtifact[];
  selected: SelectedContextArtifact[];
  onToggle: ToggleThreadContextArtifact;
}) {
  const { isMobile, open } = useSidebar();

  if (isMobile) {
    return (
      <Sidebar side="right" collapsible="offcanvas" className="[&_[data-slot=sidebar-inner]]:bg-background">
        <ThreadContextPanelBody
          threadId={threadId}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          workspaceDrive={workspaceDrive}
          candidates={candidates}
          selected={selected}
          onToggle={onToggle}
        />
      </Sidebar>
    );
  }

  if (!open) {
    return null;
  }

  return (
    <SidebarInset className={panelSurfaceClass}>
      <ThreadContextPanelBody
        threadId={threadId}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        workspaceDrive={workspaceDrive}
        candidates={candidates}
        selected={selected}
        onToggle={onToggle}
      />
    </SidebarInset>
  );
}

function ThreadContextPanelBody({
  threadId,
  workspaceId,
  workspaceName,
  workspaceDrive,
  candidates,
  selected,
  onToggle,
}: {
  threadId: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceDrive?: WorkspaceDriveData;
  candidates: ContextCandidateArtifact[];
  selected: SelectedContextArtifact[];
  onToggle: ToggleThreadContextArtifact;
}) {
  const closePanel = useCloseRightPanel();
  const selectedIds = new Set(selected.map((item) => item.artifactId));

  if (workspaceId && workspaceDrive) {
    return (
      <WorkspaceContextLibrary
        threadId={threadId}
        workspaceId={workspaceId}
        workspaceName={workspaceName ?? "Workspace"}
        drive={workspaceDrive}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onClosePanel={closePanel}
      />
    );
  }

  return (
    <GlobalContextLibrary
      threadId={threadId}
      candidates={candidates}
      selectedIds={selectedIds}
      onToggle={onToggle}
      onClosePanel={closePanel}
    />
  );
}

function WorkspaceContextLibrary({
  threadId,
  workspaceId,
  workspaceName,
  drive,
  selectedIds,
  onToggle,
  onClosePanel,
}: {
  threadId: string;
  workspaceId: string;
  workspaceName: string;
  drive: WorkspaceDriveData;
  selectedIds: Set<string>;
  onToggle: ToggleThreadContextArtifact;
  onClosePanel: () => void;
}) {
  const router = useRouter();
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
    <>
      <WorkspaceDriveLibrary
        workspaceName={workspaceName}
        onActiveFolderChange={setActiveFolderId}
        folders={drive.folders}
        artifacts={drive.artifacts}
        isArtifactSelected={(artifactId) => selectedIds.has(artifactId)}
        onToggleArtifactContext={(artifactId) =>
          void onToggle({ threadId, artifactId: toArtifactId(artifactId) })
        }
        onOpenArtifact={(artifactId) =>
          router.push(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
        }
        onMoveArtifact={async (artifactId, target) => {
          await drive.moveArtifact({
            artifactId: toArtifactId(artifactId),
            folderId: target === "root" ? undefined : toWorkspaceFolderId(target),
          });
        }}
        onClosePanel={onClosePanel}
        {...dialogState.libraryHandlers}
      />
      <WorkspaceLibraryDialogsStack
        workspaceId={workspaceId}
        workspaceName={drive.workspace?.name}
        workspaceDescription={drive.workspace?.description}
        activeFolderId={activeFolderId}
        mutations={drive}
        dialogState={dialogState}
        onAfterArchive={() => router.push("/workspaces")}
      />
    </>
  );
}

function GlobalContextLibrary({
  threadId,
  candidates,
  selectedIds,
  onToggle,
  onClosePanel,
}: {
  threadId: string;
  candidates: ContextCandidateArtifact[];
  selectedIds: Set<string>;
  onToggle: ToggleThreadContextArtifact;
  onClosePanel: () => void;
}) {
  const isEmpty = candidates.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceBoardToolbar
        workspaceName="Konteks riset"
        breadcrumb={[]}
        onNavigate={() => {}}
        onCreateFolder={() => {}}
        onCreateDocument={() => {}}
        onCreateUrl={() => {}}
        onRenameWorkspace={() => {}}
        onArchiveWorkspace={() => {}}
        onClosePanel={onClosePanel}
        showCreateActions={false}
        showWorkspaceSettings={false}
      />
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
