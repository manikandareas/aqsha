"use client";

import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { useSidebar } from "@/components/ui/sidebar";
import { ChatThreadSurface } from "./chat-thread-surface";
import type { ThreadShellLayoutProps } from "./component-types";
import { AccessDeniedState } from "./access-denied-state";
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
                  <ChatThreadSurface
                    threadId={threadId}
                    isLoading={threadId ? selectedThread === undefined : false}
                    title={threadId ? selectedThread?.title : undefined}
                    rateStatus={rateStatus}
                    threads={threads}
                    contextArtifacts={contextArtifacts}
                    onRemoveContextArtifact={onRemoveContextArtifact}
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
