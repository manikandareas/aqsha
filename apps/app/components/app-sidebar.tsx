"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { BookOpenTextIcon, MessageSquarePlusIcon } from "lucide-react";
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
                        <span className="text-xs text-muted-foreground">
                          {formatThreadDate(thread.createdAt)}
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

function formatThreadDate(value: number) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
