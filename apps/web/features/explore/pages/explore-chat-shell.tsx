"use client";

import { useState, type ReactNode } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { ExploreChatSidePanel } from "@/features/explore/components/explore-chat-side-panel";
import {
  ExploreSurfaceHeader,
  type ExploreBreadcrumb,
} from "@/features/explore/components/explore-surface-header";

// Shared chrome for every Explore surface (index + paper/news/fact detail).
// Mirrors the workspace detail split layout: a full-page main column with the
// breadcrumb header, and a toggleable right-hand global chat panel that stays
// in feature parity with the thread detail chat. The body owns its own width
// and padding; this shell only provides the height-bounded scroll container.
// The left navigation is provided by the shared AppShell layout, so this only
// renders the content split.
export function ExploreChatShell({
  breadcrumbs,
  headerCenter,
  chatSeed,
  children,
}: {
  breadcrumbs: ExploreBreadcrumb[];
  headerCenter?: ReactNode;
  chatSeed?: string;
  children: ReactNode;
}) {
  return (
    <ExploreChatShellBody
      breadcrumbs={breadcrumbs}
      headerCenter={headerCenter}
      chatSeed={chatSeed}
    >
      {children}
    </ExploreChatShellBody>
  );
}

// `useSidebar()` resolves to the LEFT sidebar context from the AppShell layout —
// it's read here, before DetailSplitLayout creates its inner right-panel
// provider. The breadcrumb header's left-sidebar trigger is wired from here,
// mirroring ThreadShellLayout / WorkspaceDetailClient.
function ExploreChatShellBody({
  breadcrumbs,
  headerCenter,
  chatSeed,
  children,
}: {
  breadcrumbs: ExploreBreadcrumb[];
  headerCenter?: ReactNode;
  chatSeed?: string;
  children: ReactNode;
}) {
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <DetailSplitLayout
        sideOpen={chatPanelOpen}
        onSideOpenChange={setChatPanelOpen}
        main={
          <>
            <ExploreSurfaceHeader
              breadcrumbs={breadcrumbs}
              centerSlot={headerCenter}
              chatOpen={chatPanelOpen}
              onToggleChat={() => setChatPanelOpen((open) => !open)}
              showLeftTrigger={!isLeftSidebarOpen}
              onToggleLeftSidebar={leftSidebar.toggleSidebar}
            />
            <div className="@container/explore min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </div>
          </>
        }
        side={
          <ResponsiveSidePanel open={chatPanelOpen}>
            <ExploreChatSidePanel
              activeThreadId={activeThreadId}
              onActiveThreadIdChange={setActiveThreadId}
              seed={chatSeed}
            />
          </ResponsiveSidePanel>
        }
      />
    </main>
  );
}
