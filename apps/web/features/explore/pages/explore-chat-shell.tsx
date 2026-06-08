"use client";

import { useState, type ReactNode } from "react";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { ExploreChatSidePanel } from "@/features/explore/components/explore-chat-side-panel";
import {
  ExploreSurfaceHeader,
  type ExploreBreadcrumb,
} from "@/features/explore/components/explore-surface-header";
import { WorkspaceShell } from "@/features/workspaces/components/workspace-shell";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";

// Shared chrome for every Explore surface (index + paper/news/fact detail).
// Mirrors the workspace detail split layout: a full-page main column with the
// breadcrumb header, and a toggleable right-hand global chat panel that stays
// in feature parity with the thread detail chat. The body owns its own width
// and padding; this shell only provides the height-bounded scroll container.
export function ExploreChatShell({
  breadcrumbs,
  chatSeed,
  children,
}: {
  breadcrumbs: ExploreBreadcrumb[];
  chatSeed?: string;
  children: ReactNode;
}) {
  const shellData = useWorkspaceIndexData();
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  return (
    <WorkspaceShell
      viewer={shellData.viewer}
      workspaces={shellData.workspaces}
      threads={shellData.threads}
      createWorkspace={shellData.createWorkspace}
      removeThread={shellData.removeThread}
    >
      <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
        <DetailSplitLayout
          sideOpen={chatPanelOpen}
          onSideOpenChange={setChatPanelOpen}
          main={
            <>
              <ExploreSurfaceHeader
                breadcrumbs={breadcrumbs}
                chatOpen={chatPanelOpen}
                onToggleChat={() => setChatPanelOpen((open) => !open)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
    </WorkspaceShell>
  );
}
