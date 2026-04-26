"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
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
  PlusIcon,
  MoreHorizontalIcon,
  LinkIcon,
  ArrowUpRightIcon,
  Trash2Icon,
  MessageCircle,
  Loader2Icon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { deleteAgentThread, listAgentThreads } from "@/features/agents/lib/api";
import type { AgentThread } from "@/features/agents/lib/types";

function formatThreadDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function NavThreads() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = React.useState<AgentThread[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AgentThread | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  const refreshThreads = React.useCallback(async () => {
    try {
      setError(null);
      const nextThreads = await listAgentThreads();
      setThreads(nextThreads);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load threads.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshThreads();
    }, 0);

    function handleThreadsChanged() {
      void refreshThreads();
    }

    window.addEventListener("agent-threads:changed", handleThreadsChanged);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("agent-threads:changed", handleThreadsChanged);
    };
  }, [refreshThreads]);

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await deleteAgentThread(deleteTarget.id);
      setDeleteTarget(null);
      await refreshThreads();

      if (pathname === `/app/threads/${deleteTarget.id}`) {
        router.push("/app/threads");
      }

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete thread.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>
          <span>Threads</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => router.push("/app/threads")}
          >
            <PlusIcon className="size-4" />
            <span className="sr-only">New thread</span>
          </Button>
        </SidebarGroupLabel>
        <SidebarMenu>
          {isLoading ? (
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/70">
                <Loader2Icon className="animate-spin" />
                <span>Loading threads</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {!isLoading && threads.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-sidebar-foreground/70"
                onClick={() => router.push("/app/threads")}
              >
                <MessageCircle />
                <span>Start a thread</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {threads.map((item) => {
            const href = `/app/threads/${item.id}`;

            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={pathname === href}
                  render={<a href={href} title={item.title} />}
                >
                  <MessageCircle />
                  <span>{item.title}</span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuAction
                        showOnHover
                        className="aria-expanded:bg-muted"
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                    <span className="sr-only">More</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-56 rounded-lg"
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => navigator.clipboard.writeText(location.origin + href)}
                      >
                        <LinkIcon className="text-muted-foreground" />
                        <span>Copy link</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open(href, "_blank")}>
                        <ArrowUpRightIcon className="text-muted-foreground" />
                        <span>Open in new tab</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2Icon />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            );
          })}
          {error ? (
            <SidebarMenuItem>
              <p className="px-2 py-1 text-xs text-destructive">{error}</p>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroup>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives &quot;{deleteTarget?.title}&quot; and removes it from the
              active thread list. Existing history is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-sm text-muted-foreground">
            Last updated {deleteTarget ? formatThreadDate(deleteTarget.updatedAt) : ""}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
