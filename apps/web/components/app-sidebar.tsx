"use client";

import { NavUser } from "@/components/nav-user";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  HomeIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NameDialog } from "@/features/workspaces/components/workspace-dialogs";
import { ThreadDeleteActions } from "@/features/thread-experience/components/thread-actions-menu";
import type {
  RemoveThread,
  ThreadSummary,
} from "@/features/thread-experience/components/component-types";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

type Viewer = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type WorkspaceSummary = {
  _id: string;
  name: string;
  updatedAt?: number;
};

const sidebarItemBaseClass =
  "h-8 gap-2 rounded-[8px] px-2.5 py-0 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5";

function sidebarItemClass(active?: boolean) {
  return cn(
    sidebarItemBaseClass,
    active
      ? "bg-primary/10 text-foreground [&_svg]:text-primary"
      : "text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-primary/70",
  );
}

export function AppSidebar({
  viewer,
  workspaces = [],
  selectedWorkspaceId,
  threads,
  selectedThreadId,
  onCreateThread,
  createWorkspace,
  removeThread,
  ...props
}: ComponentProps<typeof Sidebar> & {
  viewer: Viewer | undefined;
  workspaces?: WorkspaceSummary[];
  selectedWorkspaceId?: string;
  threads: ThreadSummary[];
  selectedThreadId?: string;
  onCreateThread: () => void;
  createWorkspace?: (args: { name: string }) => Promise<unknown>;
  removeThread?: RemoveThread;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const sortedWorkspaces = useMemo(
    () =>
      [...workspaces].sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
      ),
    [workspaces],
  );
  const sortedThreads = useMemo(
    () =>
      [...threads].sort(
        (left, right) => right.lastActivityAt - left.lastActivityAt,
      ),
    [threads],
  );
  const isHomeActive = pathname === "/app" && !selectedThreadId;
  const isWorkspaceRoute = pathname.startsWith("/app/workspaces");
  const isExploreActive = pathname.startsWith("/app/explore");
  const showWorkspaceSection = sortedWorkspaces.length > 0 || Boolean(createWorkspace);
  const showThreadSection = sortedThreads.length > 0 || Boolean(onCreateThread);
  const hasSidebarItems = showWorkspaceSection || showThreadSection;
  const workspaceSectionAction = createWorkspace ? (
    <button
      type="button"
      onClick={() => setCreateDialogOpen(true)}
      className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
      aria-label="Workspace baru"
    >
      <PlusIcon className="size-3" />
    </button>
  ) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runCreateThread = () => {
    setCommandOpen(false);
    onCreateThread();
  };

  const threadSectionAction = (
    <button
      type="button"
      onClick={runCreateThread}
      className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
      aria-label="Thread baru"
    >
      <PlusIcon className="size-3" />
    </button>
  );

  const runCreateWorkspace = () => {
    setCommandOpen(false);
    setCreateDialogOpen(true);
  };

  const closeSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  };

  const handleDeleteThread = async (thread: ThreadSummary) => {
    if (!removeThread) return;
    await removeThread({ threadId: thread.threadId });
    if (pathname === `/app/threads/${thread.threadId}`) {
      router.replace(
        thread.workspaceId ? `/app/workspaces/${thread.workspaceId}` : "/app",
      );
    }
  };

  return (
    <>
      <Sidebar
        collapsible="offcanvas"
        className="border-r border-sidebar-border/80 bg-sidebar [&_[data-slot=sidebar-inner]]:bg-sidebar"
        {...props}
      >
        <SidebarHeader className="gap-3 px-3 pb-3 pt-3.5">
          <div className="flex items-center gap-1.5 pl-1.5 pr-2.5">
            <button
              type="button"
              onClick={closeSidebar}
              className="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
              aria-label="Tutup sidebar kiri"
            >
              <PanelLeftIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
              aria-label="Cari thread"
            >
              <SearchIcon className="size-3.5" />
            </button>
          </div>

          <SidebarMenu className="gap-1">
            <PrimaryNavLink
              href="/app"
              icon={HomeIcon}
              label="Home"
              active={isHomeActive}
            />
            <PrimaryNavLink
              href="/app/explore"
              icon={TrendingUpIcon}
              label="Jelajahi"
              active={isExploreActive}
            />
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="min-h-0 px-3 pb-3 pt-2">
          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden px-0">
            <div className="grid min-w-0 gap-5 overflow-hidden">
              {!hasSidebarItems ? (
                <div className="rounded-[8px] border border-dashed border-mint-soft-border bg-mint-soft/50 px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground">
                  Belum ada thread atau workspace.
                </div>
              ) : (
                <>
                  {showWorkspaceSection ? (
                    <SidebarSection label="Workspaces" first action={workspaceSectionAction}>
                      {sortedWorkspaces.length > 0 ? (
                        <SidebarMenu className="min-w-0 gap-1 overflow-hidden">
                          {sortedWorkspaces.map((workspace) => (
                            <RecentWorkspaceRow
                              key={workspace._id}
                              workspace={workspace}
                              active={
                                isWorkspaceRoute &&
                                workspace._id === selectedWorkspaceId
                              }
                            />
                          ))}
                        </SidebarMenu>
                      ) : (
                        <EmptyWorkspaceRow onCreate={createWorkspace ? runCreateWorkspace : undefined} />
                      )}
                    </SidebarSection>
                  ) : null}
                  {showThreadSection ? (
                    <SidebarSection label="Threads" action={threadSectionAction}>
                      {sortedThreads.length > 0 ? (
                        <SidebarMenu className="min-w-0 gap-1 overflow-hidden">
                          {sortedThreads.map((thread) => (
                            <RecentThreadRow
                              key={thread.threadId}
                              thread={thread}
                              active={thread.threadId === selectedThreadId}
                              onDelete={
                                removeThread
                                  ? () => handleDeleteThread(thread)
                                  : undefined
                              }
                            />
                          ))}
                        </SidebarMenu>
                      ) : (
                        <EmptyThreadRow onCreate={runCreateThread} />
                      )}
                    </SidebarSection>
                  ) : null}
                </>
              )}
            </div>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="mt-auto px-3 py-3">
          <NavUser user={viewer} />
        </SidebarFooter>
      </Sidebar>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        {commandOpen ? (
          <>
        <CommandInput placeholder="Cari atau buat..." />
        <CommandList>
          <CommandEmpty>Tidak ada hasil.</CommandEmpty>
          <CommandGroup heading="Buat">
            <CommandItem onSelect={runCreateThread}>
              <MessageSquareIcon className="size-4" />
              Chat baru
            </CommandItem>
            {createWorkspace ? (
              <CommandItem onSelect={runCreateWorkspace}>
                <LayoutGridIcon className="size-4" />
                Workspace baru
              </CommandItem>
            ) : null}
          </CommandGroup>
          {sortedWorkspaces.length > 0 ? (
            <CommandGroup heading="Workspaces">
              {sortedWorkspaces.map((workspace) => (
                <CommandItem
                  key={workspace._id}
                  value={`workspace-${workspace.name}`}
                  onSelect={() => setCommandOpen(false)}
                  asChild
                >
                  <Link href={`/app/workspaces/${workspace._id}`}>
                    <LayoutGridIcon className="size-4" />
                    <span className="truncate">{workspace.name}</span>
                  </Link>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {sortedThreads.length > 0 ? (
            <CommandGroup heading="Threads">
              {sortedThreads.map((thread) => (
                <CommandItem
                  key={thread.threadId}
                  value={`thread-${thread.title}`}
                  onSelect={() => setCommandOpen(false)}
                  asChild
                >
                  <Link href={`/app/threads/${thread.threadId}`}>
                    <MessageSquareIcon className="size-4" />
                    <span className="truncate">{thread.title}</span>
                  </Link>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
          </>
        ) : null}
      </CommandDialog>
      {createWorkspace ? (
        <NameDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        title="Workspace baru"
        description="Buat area riset personal."
        submitLabel="Buat"
          onSubmit={async ({ name }) => {
            const workspaceId = await createWorkspace({ name });
            router.push(`/app/workspaces/${String(workspaceId)}`);
          }}
        />
      ) : null}
    </>
  );
}

function PrimaryNavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof HomeIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        isActive={active}
        size="sm"
        className={sidebarItemClass(active)}
      >
        <Link href={href}>
          <Icon className="size-3.5 shrink-0" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarSection({
  label,
  children,
  first,
  action,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between gap-1 px-0.5 pb-1.5",
          first ? "pt-0" : "pt-1",
        )}
      >
        <span className="text-[11px] font-medium tracking-[-0.01em] text-primary/75">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function RecentThreadRow({
  thread,
  active,
  onDelete,
}: {
  thread: ThreadSummary;
  active: boolean;
  onDelete?: () => Promise<void>;
}) {
  const deleteDescription = thread.workspaceId
    ? "Thread dan pesannya akan dihapus permanen dari workspace ini."
    : "Thread dan pesannya akan dihapus permanen.";

  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        size="sm"
        isActive={active}
        className={cn(
          sidebarItemClass(active),
          "w-full min-w-0 max-w-full overflow-hidden",
        )}
      >
        <Link
          href={`/app/threads/${thread.threadId}`}
          className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden"
        >
          <MessageSquareIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-normal">
            {truncateWords(thread.title, 18)}
          </span>
          {thread.status === "streaming" ? (
            <span className="ml-auto inline-flex size-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
        </Link>
      </SidebarMenuButton>
      {onDelete ? (
        <ThreadDeleteActions
          variant="sidebar-row"
          description={deleteDescription}
          onDelete={onDelete}
        />
      ) : null}
    </SidebarMenuItem>
  );
}

function EmptyWorkspaceRow({ onCreate }: { onCreate?: () => void }) {
  if (onCreate) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-muted/60 hover:text-foreground"
      >
        <LayoutGridIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">Buat workspace pertama</span>
        <PlusIcon className="size-3 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="rounded-[8px] border border-dashed border-border/70 px-2.5 py-2 text-[11px] font-medium leading-5 text-muted-foreground">
      Belum ada workspace.
    </div>
  );
}

function EmptyThreadRow({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-muted/60 hover:text-foreground"
    >
      <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">Buat thread baru</span>
      <PlusIcon className="size-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

function RecentWorkspaceRow({
  workspace,
  active,
}: {
  workspace: WorkspaceSummary;
  active: boolean;
}) {
  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        size="sm"
        isActive={active}
        className={cn(
          sidebarItemClass(active),
          "w-full min-w-0 max-w-full overflow-hidden",
        )}
      >
        <Link
          href={`/app/workspaces/${workspace._id}`}
          className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden"
        >
          <LayoutGridIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-normal">
            {workspace.name}
          </span>
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
