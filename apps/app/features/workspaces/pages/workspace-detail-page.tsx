"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StartThread } from "@/features/thread-experience/components/component-types";
import { panelSurfaceClass } from "@/lib/panel-surface";
import {
  toArtifactId,
  toArtifactIds,
  toWorkspaceFolderId,
  toWorkspaceId,
} from "@/lib/convex-refs";
import { useWorkspaceDetailData } from "../api/use-workspaces-data";
import { WorkspaceChatPanel } from "../components/workspace-chat-panel";
import { WorkspaceDriveLibrary } from "../components/workspace-drive-library";
import { WorkspaceLibraryDialogsStack } from "../components/workspace-library-dialogs-stack";
import { WorkspaceShell } from "../components/workspace-shell";
import { useWorkspaceDraftContext } from "../hooks/use-workspace-draft-context";
import { useWorkspaceLibraryDialogState } from "../hooks/use-workspace-library-dialogs";

export function WorkspaceDetailPage({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const data = useWorkspaceDetailData(workspaceId);
  const dialogState = useWorkspaceLibraryDialogState();
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<"root" | string>("root");
  const draftContext = useWorkspaceDraftContext(workspaceId);

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

  const libraryMutations = {
    renameWorkspace: data.renameWorkspace,
    archiveWorkspace: data.archiveWorkspace,
    createFolder: data.createFolder,
    createDocument: data.createDocument,
    createUrl: data.createUrl,
    renameFolder: data.renameFolder,
    renameArtifact: data.renameArtifact,
    removeFolder: data.removeFolder,
    removeArtifact: data.removeArtifact,
  };

  return (
    <WorkspaceShell
      viewer={data.viewer}
      workspaces={data.workspaces}
      selectedWorkspaceId={workspaceId}
      threads={data.threads}
      createWorkspace={data.createWorkspace}
    >
      <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
        {data.isLoading ? (
          <WorkspaceLoading />
        ) : data.workspace === null ? (
          <WorkspaceMissing />
        ) : data.workspace ? (
          <SidebarProvider
            open={chatPanelOpen}
            onOpenChange={setChatPanelOpen}
            className="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background p-3"
          >
            <div
              className={cn(
                "grid min-h-0 w-full flex-1 gap-3",
                chatPanelOpen ? "md:grid-cols-2" : "md:grid-cols-1",
              )}
            >
              <SidebarInset className={panelSurfaceClass}>
                <WorkspaceDriveLibrary
                  workspaceName={data.workspace.name}
                  onActiveFolderChange={setActiveFolderId}
                  folders={data.folders}
                  artifacts={data.artifacts}
                  isArtifactSelected={draftContext.isSelected}
                  onToggleArtifactContext={draftContext.toggleArtifact}
                  onOpenArtifact={(artifactId) =>
                    router.push(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
                  }
                  onMoveArtifact={async (artifactId, target) => {
                    await data.moveArtifact({
                      artifactId: toArtifactId(artifactId),
                      folderId:
                        target === "root" ? undefined : toWorkspaceFolderId(target),
                    });
                  }}
                  chatPanelOpen={chatPanelOpen}
                  onToggleChatPanel={() => setChatPanelOpen((open) => !open)}
                  {...dialogState.libraryHandlers}
                />
              </SidebarInset>
              <WorkspaceChatPanel
                workspaceId={workspaceId}
                workspaceName={data.workspace.name}
                threads={data.workspaceThreads}
                contextArtifacts={contextArtifacts}
                onRemoveContextArtifact={draftContext.toggleArtifact}
                rateStatus={data.rateStatus}
                startThread={handleStartThread}
                onOpenThread={(threadId) => router.push(`/threads/${threadId}`)}
              />
            </div>
          </SidebarProvider>
        ) : null}
      </main>

      <WorkspaceLibraryDialogsStack
        workspaceId={workspaceId}
        workspaceName={data.workspace?.name}
        workspaceDescription={data.workspace?.description}
        activeFolderId={activeFolderId}
        mutations={libraryMutations}
        dialogState={dialogState}
        onAfterArchive={() => router.push("/workspaces")}
      />
    </WorkspaceShell>
  );
}

function WorkspaceLoading() {
  return (
    <div className="grid gap-4 px-4 py-5 sm:px-6">
      <p className="text-[12px] font-medium text-muted-foreground">Memuat workspace...</p>
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

function WorkspaceMissing() {
  return (
    <div className="grid min-h-svh place-items-center px-4 text-center">
      <div className="grid gap-3">
        <h1 className="font-heading text-2xl font-semibold">Workspace tidak tersedia.</h1>
        <p className="text-[13px] font-medium text-muted-foreground">
          Workspace ini tidak ditemukan untuk akun yang sedang masuk.
        </p>
      </div>
    </div>
  );
}
