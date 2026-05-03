"use client";

import {
  Loader2Icon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { ConfirmTitleDeleteDialog } from "@/components/confirm-title-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  useChatThreadsQuery,
  useDeleteChatThreadMutation,
} from "@/features/chat/lib/queries";
import type { ChatThread } from "@/features/chat/lib/types";
import { getEdenErrorMessage } from "@/lib/eden-error";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const threadRequestFailedMessage = "Thread request failed. Try again.";

function getThreadErrorMessage(error: unknown): string {
  return getEdenErrorMessage(error, threadRequestFailedMessage);
}

function ThreadActions({
  thread,
  isMobile,
  onDeleteClick,
}: {
  thread: ChatThread;
  isMobile: boolean;
  onDeleteClick: (thread: ChatThread) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction
            showOnHover
            className="text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground aria-expanded:bg-sidebar-accent/70"
          />
        }
      >
        <MoreHorizontalIcon />
        <span className="sr-only">More</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 rounded-lg"
        side={isMobile ? "bottom" : "right"}
        align={isMobile ? "end" : "start"}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDeleteClick(thread)}
          >
            <Trash2Icon />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NavThreads() {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [threadToDelete, setThreadToDelete] = React.useState<ChatThread | null>(
    null,
  );
  const threadsQuery = useChatThreadsQuery();
  const deleteThreadMutation = useDeleteChatThreadMutation();
  const threads = threadsQuery.data ?? [];
  const displayedError = threadsQuery.error
    ? getThreadErrorMessage(threadsQuery.error)
    : null;

  async function handleDeleteThread(thread: ChatThread): Promise<void> {
    try {
      await deleteThreadMutation.mutateAsync(thread.id);
      toast.success({
        title: "Thread deleted",
        description: `Deleted “${thread.title}” from your threads.`,
      });

      if (pathname === `/app/threads/${thread.id}`) {
        router.push("/app");
      }
    } catch (cause) {
      const message = getThreadErrorMessage(cause);
      toast.error({
        title: "Could not delete thread",
        description: message,
      });
      throw new Error(message);
    }
  }

  return (
    <SidebarGroup className="px-1 py-0.5 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="h-7 px-2 text-[11px] font-semibold tracking-[0.06em] text-sidebar-foreground/60">
        <span>THREADS</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto -mr-1 text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          render={<Link href="/app" />}
        >
          <PlusIcon />
          <span className="sr-only">Create thread</span>
        </Button>
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {threadsQuery.isLoading ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="h-9 rounded-lg text-[13px] text-sidebar-foreground/60"
            >
              <Loader2Icon className="animate-spin" />
              <span>Loading threads</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!threadsQuery.isLoading && displayedError ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="h-auto min-h-9 cursor-default rounded-lg text-sidebar-foreground/60"
            >
              <span className="text-[13px] leading-5">{displayedError}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!threadsQuery.isLoading && !displayedError && threads.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="h-9 cursor-default rounded-lg text-sidebar-foreground/60"
            >
              <MessageCircleIcon className="h-[14px] w-[14px] text-sidebar-foreground/55" />
              <span className="text-[13px]">No threads yet</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {threads.map((thread) => {
          const isActive = pathname === `/app/threads/${thread.id}`;

          return (
            <SidebarMenuItem key={thread.id}>
              <SidebarMenuButton
                isActive={isActive}
                render={
                  <Link
                    href={`/app/threads/${thread.id}`}
                    title={thread.title}
                  />
                }
                className={cn(
                  "h-9 rounded-lg text-[13px] font-medium transition-colors",
                  "focus-visible:ring-sidebar-ring",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent"
                    : "text-sidebar-foreground/72 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <MessageCircleIcon
                  className={cn(
                    "h-[14px] w-[14px] shrink-0",
                    isActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/62",
                  )}
                />
                <span className="truncate">{thread.title}</span>
              </SidebarMenuButton>
              <ThreadActions
                thread={thread}
                isMobile={isMobile}
                onDeleteClick={setThreadToDelete}
              />
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
      {threadToDelete ? (
        <ConfirmTitleDeleteDialog
          open={Boolean(threadToDelete)}
          onOpenChange={(open) => {
            if (!open) {
              setThreadToDelete(null);
            }
          }}
          confirmationTitle={threadToDelete.title}
          inputId={`delete-thread-title-${threadToDelete.id}`}
          title="Delete thread?"
          description="Type the exact thread title before deleting it permanently."
          actionLabel="Delete"
          errorMessage={threadRequestFailedMessage}
          onDelete={() => handleDeleteThread(threadToDelete)}
        />
      ) : null}
    </SidebarGroup>
  );
}
