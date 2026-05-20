"use client";

import { NavUser } from "@/components/nav-user";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  BugIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  MessageSquarePlusIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

type Viewer = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type ThreadSummary = {
  threadId: string;
  workspaceId?: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  lastMessagePreview: string;
  messageCount: number;
  status: "idle" | "streaming" | "failed";
};

type WorkspaceSummary = {
  _id: string;
  name: string;
};

export function AppSidebar({
  viewer,
  workspaces = [],
  selectedWorkspaceId,
  threads,
  selectedThreadId,
  onCreateThread,
  onCreateWorkspace,
  ...props
}: ComponentProps<typeof Sidebar> & {
  viewer: Viewer | undefined;
  workspaces?: WorkspaceSummary[];
  selectedWorkspaceId?: string;
  threads: ThreadSummary[];
  selectedThreadId?: string;
  onCreateThread: () => void;
  onCreateWorkspace?: () => void;
}) {
  const threadGroups = groupThreadsByScope(threads, selectedWorkspaceId);
  const activeWorkspace = workspaces.find((workspace) => workspace._id === selectedWorkspaceId);
  const { isMobile, setOpen, setOpenMobile } = useSidebar();

  const closeSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  };

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/80 bg-sidebar [&_[data-slot=sidebar-inner]]:bg-sidebar"
      {...props}
    >
      <SidebarHeader className="gap-2 px-2.5 pb-1.5 pt-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={closeSidebar}
            className="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Tutup sidebar kiri"
          >
            <PanelLeftIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-70"
            disabled
            aria-label="Cari thread"
          >
            <SearchIcon className="size-3.5" />
          </button>
        </div>
        <SidebarMenu className="gap-0.5">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onCreateWorkspace={onCreateWorkspace}
          />
          <PrimaryNavRow
            icon={MessageSquarePlusIcon}
            label="Chat baru"
            onClick={onCreateThread}
          />
          <PrimaryNavRow icon={SparklesIcon} label="Otomasi" disabled />
          <PrimaryNavRow icon={BugIcon} label="Audit riset" disabled />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1 pb-1 pt-0">
        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden px-0">
          <div className="grid min-w-0 gap-1.5 overflow-hidden">
            {threadGroups.length === 0 ? (
              <div className="mx-1.5 mt-1.5 rounded-[7px] border border-dashed border-sidebar-border bg-muted/25 p-2 text-[12px] text-muted-foreground">
                Belum ada thread.
              </div>
            ) : (
              threadGroups.map((section) => (
                <div key={section.label} className="min-w-0 overflow-hidden">
                  <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground">
                    {section.label}
                  </div>
                  <SidebarMenu className="min-w-0 gap-px overflow-hidden">
                    {section.items.map((thread) => (
                      <ThreadRow
                        key={thread.threadId}
                        thread={thread}
                        active={thread.threadId === selectedThreadId}
                      />
                    ))}
                  </SidebarMenu>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="mt-auto flex flex-col gap-2 border-t border-transparent p-1.5">
        <NavUser user={viewer} />
      </SidebarFooter>
    </Sidebar>
  );
}

function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onCreateWorkspace,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | undefined;
  onCreateWorkspace?: () => void;
}) {
  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        className="h-8 rounded-[7px] px-1.5 text-[12px] font-semibold text-sidebar-foreground/90 hover:bg-muted/70 hover:text-foreground"
      >
        <Link href={activeWorkspace ? `/workspaces/${activeWorkspace._id}` : "/workspaces"}>
          <FolderIcon className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {activeWorkspace?.name ?? "Workspaces"}
          </span>
          <ChevronsUpDownIcon className="ml-auto size-3.5 text-muted-foreground" />
        </Link>
      </SidebarMenuButton>
      <div className="mt-1 grid gap-px pl-5">
        {workspaces.slice(0, 5).map((workspace) => (
          <Link
            key={workspace._id}
            href={`/workspaces/${workspace._id}`}
            className={cn(
              "truncate rounded-[6px] px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              activeWorkspace?._id === workspace._id && "bg-muted text-foreground",
            )}
          >
            {workspace.name}
          </Link>
        ))}
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/workspaces"
            className="min-w-0 flex-1 truncate rounded-[6px] px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            Semua workspace
          </Link>
          {onCreateWorkspace ? (
            <button
              type="button"
              onClick={onCreateWorkspace}
              className="flex size-5 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Workspace baru"
            >
              <PlusIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </SidebarMenuItem>
  );
}

function PrimaryNavRow({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof MessageSquarePlusIcon;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        type="button"
        className={cn(
          "h-7 rounded-[7px] px-1.5 text-[12px] font-medium text-sidebar-foreground/88 hover:bg-muted/70 hover:text-foreground",
          disabled && "opacity-70",
        )}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon className="size-3.5 text-muted-foreground" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ThreadRow({
  thread,
  active,
}: {
  thread: ThreadSummary;
  active: boolean;
}) {
  const title = truncateWords(thread.title, 18);

  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "h-8 w-full min-w-0 max-w-full overflow-hidden rounded-[7px] px-2 text-[12px] text-sidebar-foreground/88 hover:bg-muted/70",
          active &&
            "bg-muted text-foreground shadow-none",
        )}
      >
        <Link
          href={`/threads/${thread.threadId}`}
          className="flex min-w-0 max-w-full items-center overflow-hidden"
        >
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium leading-4">
            {title}
          </span>
          {thread.status === "streaming" ? (
            <span className="ml-auto inline-flex size-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function truncateWords(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(" ")}...`;
}

type ThreadSection = { label: string; items: ThreadSummary[] };

function groupThreadsByScope(
  threads: ThreadSummary[],
  selectedWorkspaceId?: string,
): ThreadSection[] {
  if (threads.length === 0) return [];
  const workspaceThreads = selectedWorkspaceId
    ? threads.filter((thread) => thread.workspaceId === selectedWorkspaceId)
    : [];
  const globalThreads = threads.filter((thread) => !thread.workspaceId);
  const sections: ThreadSection[] = [];
  if (workspaceThreads.length > 0) {
    sections.push({ label: "Workspace threads", items: workspaceThreads });
  }
  if (globalThreads.length > 0) {
    sections.push({ label: "Global threads", items: globalThreads });
  }
  const otherThreads = selectedWorkspaceId
    ? threads.filter((thread) => thread.workspaceId && thread.workspaceId !== selectedWorkspaceId)
    : threads.filter((thread) => thread.workspaceId);
  if (otherThreads.length > 0) {
    sections.push({ label: "Workspace lain", items: otherThreads });
  }
  return sections;
}
