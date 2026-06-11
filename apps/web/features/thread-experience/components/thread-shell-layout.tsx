"use client";

import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { useSidebar } from "@/components/ui/sidebar";
import { ThreadChatSurface } from "./chat-thread-state";
import type { ThreadShellLayoutProps } from "./component-types";
import { AccessDeniedState } from "./home-states";
import { ThreadHeader } from "./thread-header";

export function ThreadShellLayout({
  threads,
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
  onRetryRun,
  onDeleteThread,
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
    <div className="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
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
                  <ThreadChatSurface
                    threadId={threadId}
                    isLoading={threadId ? selectedThread === undefined : false}
                    title={threadId ? selectedThread?.title : undefined}
                    rateStatus={rateStatus}
                    startThread={startThread}
                    onSend={sendMessage}
                    runs={runs}
                    artifacts={artifacts}
                    sources={sources}
                    threads={threads}
                    onCancelRun={onCancelRun}
                    onRetryRun={onRetryRun}
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
  );
}
