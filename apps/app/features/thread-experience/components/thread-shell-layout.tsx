"use client";

import { type CSSProperties } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { ChatThreadState } from "./chat-thread-state";
import type { ThreadShellLayoutProps } from "./component-types";
import { AccessDeniedState } from "./home-states";
import { ThreadHeader } from "./thread-header";

export function ThreadShellLayout({
  viewer,
  workspaces = [],
  threads,
  selectedThreadId,
  onCreateThread,
  title,
  threadId,
  selectedThread,
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
  const workspaceName = selectedThread?.workspaceId
    ? workspaces.find((workspace) => workspace._id === selectedThread.workspaceId)?.name ??
      "Workspace thread"
    : undefined;

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
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <SidebarProvider
          open={rightPanelOpen}
          onOpenChange={onRightPanelOpenChange}
          style={
            {
              "--sidebar-width": "52rem",
              "--sidebar-width-mobile": "34rem",
            } as CSSProperties
          }
          className="h-full min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden bg-background">
            <ThreadHeader
              title={title}
              workspaceName={workspaceName}
              showLeftTrigger={!isLeftSidebarOpen}
              onToggleLeftSidebar={leftSidebar.toggleSidebar}
              showRightTrigger={false}
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
        </SidebarProvider>
      </SidebarInset>
    </>
  );
}
