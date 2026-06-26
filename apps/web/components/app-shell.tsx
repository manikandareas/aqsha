"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";

// Persistent shell for every authenticated product surface (threads, workspaces,
// explore). Hoisting the left navigation here — instead of re-rendering it inside
// each page shell — means the sidebar stays mounted across navigations (no
// remount/flicker, no layout shift) and the sidebar data is fetched once. Pages
// render only their content into SidebarInset, so route-level loading.tsx fills
// the content area without covering the nav.
export function AppShell({
  defaultSidebarOpen,
  children,
}: {
  defaultSidebarOpen: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useParams<{ threadId?: string; workspaceId?: string }>();
  const { viewer, workspaces, threads, createWorkspace, removeThread } =
    useWorkspaceIndexData();

  // Selected state is fully derivable from the URL. For a thread route we don't
  // know the owning workspace from the path alone, so resolve it from the
  // already-fetched thread list to keep the workspace row highlighted.
  const selectedThreadId = params?.threadId;
  const selectedWorkspaceId =
    params?.workspaceId ??
    (selectedThreadId
      ? undefined
      : undefined);

  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      style={
        {
          "--sidebar-width": "16.5rem",
          "--sidebar-width-mobile": "17.5rem",
        } as CSSProperties
      }
      className="min-h-svh"
    >
      <AppSidebar
        viewer={viewer}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        threads={threads}
        selectedThreadId={selectedThreadId}
        onCreateThread={() => router.push("/app")}
        createWorkspace={createWorkspace}
        removeThread={removeThread}
      />
      <SidebarInset className="relative min-h-svh bg-background text-foreground">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
