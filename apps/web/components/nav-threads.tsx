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
  useCreateChatThreadMutation,
  useDeleteChatThreadMutation,
} from "@/features/chat/lib/queries";
import type { ChatThread } from "@/features/chat/lib/types";
import { getEdenErrorMessage } from "@/lib/eden-error";

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
          <SidebarMenuAction showOnHover className="aria-expanded:bg-muted" />
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
  const [error, setError] = React.useState<string | null>(null);
  const [threadToDelete, setThreadToDelete] = React.useState<ChatThread | null>(
    null,
  );
  const threadsQuery = useChatThreadsQuery();
  const createThreadMutation = useCreateChatThreadMutation();
  const deleteThreadMutation = useDeleteChatThreadMutation();
  const threads = threadsQuery.data ?? [];
  const queryError = threadsQuery.error
    ? getThreadErrorMessage(threadsQuery.error)
    : null;
  const displayedError = error ?? queryError;

  async function handleCreateThread(): Promise<void> {
    setError(null);

    try {
      const thread = await createThreadMutation.mutateAsync();
      router.push(`/app/threads/${thread.id}`);
    } catch (cause) {
      setError(getThreadErrorMessage(cause));
    }
  }

  async function handleDeleteThread(thread: ChatThread): Promise<void> {
    try {
      await deleteThreadMutation.mutateAsync(thread.id);
      setError(null);

      if (pathname === `/app/threads/${thread.id}`) {
        router.push("/app");
      }
    } catch (cause) {
      throw new Error(getThreadErrorMessage(cause));
    }
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        <span>Threads</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto -mr-1 text-muted-foreground hover:text-foreground"
          onClick={() => void handleCreateThread()}
          disabled={createThreadMutation.isPending}
        >
          {createThreadMutation.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlusIcon />
          )}
          <span className="sr-only">Create thread</span>
        </Button>
      </SidebarGroupLabel>
      <SidebarMenu>
        {threadsQuery.isLoading ? (
          <SidebarMenuItem>
            <SidebarMenuButton disabled>
              <Loader2Icon className="animate-spin" />
              <span>Loading threads</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!threadsQuery.isLoading && displayedError ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="cursor-default text-sidebar-foreground/40"
            >
              <span className="text-[13px]">{displayedError}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!threadsQuery.isLoading && !displayedError && threads.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="cursor-default text-sidebar-foreground/40"
            >
              <span className="text-[13px]">No threads yet</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {threads.map((thread) => (
          <SidebarMenuItem key={thread.id}>
            <SidebarMenuButton
              isActive={pathname === `/app/threads/${thread.id}`}
              render={
                <Link href={`/app/threads/${thread.id}`} title={thread.title} />
              }
              className="h-8 text-[13px] font-medium"
            >
              <MessageCircleIcon className="h-[14px] w-[14px] shrink-0 text-sidebar-foreground/45" />
              <span className="truncate">{thread.title}</span>
            </SidebarMenuButton>
            <ThreadActions
              thread={thread}
              isMobile={isMobile}
              onDeleteClick={setThreadToDelete}
            />
          </SidebarMenuItem>
        ))}
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
