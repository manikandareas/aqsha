"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { useSidebar } from "@/components/ui/sidebar";
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
  onSelectThread,
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
  onCancelRun,
  onDeleteThread,
  removeThread,
  sidePanel,
  contextArtifacts,
  onRemoveContextArtifact,
}: ThreadShellLayoutProps) {
  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;
  const showContextPanel = Boolean(sidePanel);

  return (
    <>
      <AppSidebar
        viewer={viewer}
        workspaces={workspaces}
        selectedWorkspaceId={selectedThread?.workspaceId}
        threads={threads}
        selectedThreadId={selectedThreadId}
        onCreateThread={onCreateThread}
        removeThread={removeThread}
      />
      <div className="flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <DetailSplitLayout
          sideOpen={showContextPanel && rightPanelOpen}
          onSideOpenChange={onRightPanelOpenChange}
          main={
            <>
              <ThreadHeader
                title={title}
                threads={threads}
                onSelectThread={onSelectThread}
                onCreateThread={onCreateThread}
                showLeftTrigger={!isLeftSidebarOpen}
                onToggleLeftSidebar={leftSidebar.toggleSidebar}
                showContextToggle={showContextPanel}
                contextPanelOpen={rightPanelOpen}
                onToggleContextPanel={() => onRightPanelOpenChange(!rightPanelOpen)}
                threadId={threadId}
                onDeleteThread={onDeleteThread}
              />
              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {threadId && selectedThread === null ? (
                  <AccessDeniedState />
                ) : (
                  <ChatThreadState
                    threadId={threadId}
                    isLoading={threadId ? selectedThread === undefined : false}
                    title={threadId ? selectedThread?.title : undefined}
                    rateStatus={rateStatus}
                    startThread={startThread}
                    onSend={sendMessage}
                    runs={runs}
                    artifacts={artifacts}
                    sources={sources}
                    onCancelRun={onCancelRun}
                    contextArtifacts={contextArtifacts}
                    onRemoveContextArtifact={onRemoveContextArtifact}
                    threadWorkspaceId={selectedThread?.workspaceId}
                  />
                )}
              </main>
            </>
          }
          side={sidePanel}
        />
      </div>
    </>
  );
}
