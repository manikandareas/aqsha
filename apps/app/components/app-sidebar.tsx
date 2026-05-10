"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { BookOpenTextIcon, LibraryIcon, MessageSquarePlusIcon } from "lucide-react";
import { NavUser } from "@/components/nav-user";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Viewer = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type ThreadSummary = {
  threadId: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  lastMessagePreview: string;
  messageCount: number;
  status: "idle" | "streaming" | "failed";
};

export function AppSidebar({
  viewer,
  threads,
  selectedThreadId,
  isCreating,
  onCreateThread,
  ...props
}: ComponentProps<typeof Sidebar> & {
  viewer: Viewer | undefined;
  threads: ThreadSummary[];
  selectedThreadId?: string;
  isCreating: boolean;
  onCreateThread: () => void;
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-3 border-b border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
                  A
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="font-heading truncate text-base font-bold">
                    Aqsha
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Research threads
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button
          type="button"
          className="h-10 justify-start gap-2 rounded-[10px]"
          onClick={onCreateThread}
          disabled={isCreating}
        >
          <MessageSquarePlusIcon className="size-4" />
          {isCreating ? "Membuat..." : "Tulis chat baru"}
        </Button>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarMenu className="mb-2">
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="rounded-[10px]">
              <Link href="/sources">
                <LibraryIcon className="size-4 text-[var(--mint)]" />
                <span className="font-semibold">Sources</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 py-2 text-xs font-semibold text-muted-foreground">
          Threads
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <SidebarMenu className="gap-1">
            {threads.length === 0 ? (
              <div className="mx-2 rounded-[10px] border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
                Belum ada thread.
              </div>
            ) : (
              threads.map((thread) => (
                <SidebarMenuItem key={thread.threadId}>
                  <SidebarMenuButton
                    asChild
                    isActive={thread.threadId === selectedThreadId}
                    className={cn(
                      "h-auto items-start gap-3 rounded-[10px] py-3",
                      thread.threadId === selectedThreadId &&
                        "border-l-[3px] border-l-primary bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <Link href={`/thread/${thread.threadId}`}>
                      <BookOpenTextIcon className="mt-0.5 size-4 text-primary" />
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="truncate text-sm font-semibold">
                          {thread.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {thread.lastMessagePreview ||
                            formatThreadActivity(thread.lastActivityAt)}
                        </span>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {thread.status === "streaming"
                            ? "Astra sedang menulis"
                            : formatThreadActivity(thread.lastActivityAt)}
                        </span>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <NavUser user={viewer} />
      </SidebarFooter>
    </Sidebar>
  );
}

function formatThreadActivity(value: number) {
  const diff = Date.now() - value;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "Baru saja";
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} menit lalu`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} jam lalu`;
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
