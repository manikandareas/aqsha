"use client";

import { useMemo } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { panelSurfaceClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { ChatThreadState } from "./chat-thread-state";
import type { ThreadShellLayoutProps } from "./component-types";
import { AccessDeniedState } from "./home-states";
import { ThreadContextPanel } from "./thread-context-panel";
import { ThreadHeader } from "./thread-header";

export function ThreadShellLayout({
  viewer,
  workspaces = [],
  workspaceDrive,
  threads,
  selectedThreadId,
  onCreateThread,
  title,
  threadId,
  selectedThread,
  selectedContextArtifacts,
  contextCandidateArtifacts,
  toggleThreadContextArtifact,
  rateStatus,
  startThread,
  sendMessage,
  runs,
  artifacts,
  sources,
  rightPanelOpen,
  onRightPanelOpenChange,
  onOpenArtifact,
  onOpenSources,
  onCancelRun,
}: ThreadShellLayoutProps) {
  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;
  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace._id, workspace.name])),
    [workspaces],
  );
  const workspaceName = selectedThread?.workspaceId
    ? (workspaceNameById.get(selectedThread.workspaceId) ?? "Workspace")
    : undefined;
  const showContextPanel = Boolean(threadId && selectedThread !== null);

  return (
    <>
      <AppSidebar
        viewer={viewer}
        workspaces={workspaces}
        selectedWorkspaceId={selectedThread?.workspaceId}
        threads={threads}
        selectedThreadId={selectedThreadId}
        onCreateThread={onCreateThread}
      />
      <SidebarInset className="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <SidebarProvider
          open={rightPanelOpen}
          onOpenChange={onRightPanelOpenChange}
          className="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background p-3"
        >
          <div
            className={cn(
              "grid min-h-0 w-full flex-1 gap-3",
              showContextPanel && rightPanelOpen ? "md:grid-cols-2" : "md:grid-cols-1",
            )}
          >
            <SidebarInset className={panelSurfaceClass}>
              <ThreadHeader
                title={title}
                workspaceName={workspaceName}
                showLeftTrigger={!isLeftSidebarOpen}
                onToggleLeftSidebar={leftSidebar.toggleSidebar}
                showContextToggle={showContextPanel}
                contextPanelOpen={rightPanelOpen}
                onToggleContextPanel={() => onRightPanelOpenChange(!rightPanelOpen)}
              />
              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {threadId && selectedThread === null ? (
                  <AccessDeniedState />
                ) : (
                  <ChatThreadState
                    threadId={threadId}
                    isLoading={threadId ? selectedThread === undefined : false}
                    title={threadId ? selectedThread?.title : undefined}
                    recentThreads={threads.slice(0, 3)}
                    rateStatus={rateStatus}
                    startThread={startThread}
                    onSend={sendMessage}
                    runs={runs}
                    artifacts={artifacts}
                    onOpenArtifact={onOpenArtifact}
                    sources={sources}
                    onOpenSources={onOpenSources}
                    onCancelRun={onCancelRun}
                  />
                )}
              </main>
            </SidebarInset>
            {showContextPanel ? (
              <ThreadContextPanel
                threadId={threadId!}
                workspaceId={selectedThread?.workspaceId}
                workspaceName={workspaceName}
                workspaceDrive={workspaceDrive}
                candidates={contextCandidateArtifacts}
                selected={selectedContextArtifacts}
                onToggle={toggleThreadContextArtifact}
              />
            ) : null}
          </div>
        </SidebarProvider>
      </SidebarInset>
    </>
  );
}
