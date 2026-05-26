"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function WorkspaceShell({
  viewer,
  workspaces,
  threads,
  selectedWorkspaceId,
  createWorkspace,
  removeThread,
  children,
}: {
  viewer:
    | {
        name: string | null;
        email: string | null;
        image: string | null;
      }
    | undefined;
  workspaces: Array<{ _id: string; name: string }>;
  threads: Array<{
    threadId: string;
    workspaceId?: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
  }>;
  selectedWorkspaceId?: string;
  createWorkspace: (args: { name: string }) => Promise<unknown>;
  removeThread?: (args: { threadId: string }) => Promise<{ ok: true }>;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <SidebarProvider
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
        onCreateThread={() => router.push("/")}
        createWorkspace={createWorkspace}
        removeThread={removeThread}
      />
      <SidebarInset className="min-h-svh bg-background text-foreground">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
