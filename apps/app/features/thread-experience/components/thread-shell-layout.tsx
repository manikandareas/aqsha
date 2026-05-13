"use client";

import { type CSSProperties } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ResearchSidebar } from "@/components/sources-panel";
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
  threads,
  selectedThreadId,
  onCreateThread,
  hasResearchPayload,
  title,
  threadId,
  selectedThread,
  rateStatus,
  startThread,
  sendMessage,
  sources,
  runs,
  artifacts,
  activeArtifact,
  activeCitation,
  onCitationClick,
  rightPanelOpen,
  rightPanelTab,
  onRightPanelOpenChange,
  onRightPanelTabChange,
  onOpenArtifact,
  onCancelRun,
  onRetryRun,
}: ThreadShellLayoutProps) {
  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  return (
    <>
      <AppSidebar
        viewer={viewer}
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
              showLeftTrigger={!isLeftSidebarOpen}
              onToggleLeftSidebar={leftSidebar.toggleSidebar}
              showRightTrigger={hasResearchPayload}
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
                  sources={sources}
                  runs={runs}
                  artifacts={artifacts}
                  onCitationClick={onCitationClick}
                  onOpenArtifact={onOpenArtifact}
                  onCancelRun={onCancelRun}
                  onRetryRun={onRetryRun}
                />
              )}
            </main>
          </SidebarInset>
          {hasResearchPayload ? (
            <ResearchSidebar
              threadTitle={threadId ? selectedThread?.title : undefined}
              sources={sources}
              artifacts={artifacts}
              activeArtifact={activeArtifact ?? null}
              activeTab={rightPanelTab}
              activeCitation={activeCitation}
              onTabChange={onRightPanelTabChange}
              onOpenArtifact={onOpenArtifact}
              onClosePanel={() => onRightPanelOpenChange(false)}
            />
          ) : null}
        </SidebarProvider>
      </SidebarInset>
    </>
  );
}
