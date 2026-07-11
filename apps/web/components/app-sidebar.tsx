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
  ChevronRightIcon,
  HomeIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TrendingUpIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreateWorkspacePopover } from "@/features/workspaces/components/create-workspace-popover";
import { NameDialog } from "@/features/workspaces/components/workspace-dialogs";
import { ThreadActionsMenu } from "@/features/thread-experience/components/thread-actions-menu";
import type {
  RemoveThread,
  ThreadSummary,
  TogglePinThread,
} from "@/features/thread-experience/components/component-types";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

type Viewer = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type WorkspaceSummary = {
  _id: string;
  name: string;
  emoji?: string;
  updatedAt?: number;
};

const emptyWorkspaces: WorkspaceSummary[] = [];
const MOBILE_THREAD_TITLE_MAX_CHARS = 42;
const THREADS_COLLAPSED_STORAGE_KEY = "aqsha:sidebar:threads-collapsed";
const OLD_THREADS_COLLAPSED_STORAGE_KEY =
  "aqsha:sidebar:old-threads-collapsed";
const WORKSPACES_COLLAPSED_STORAGE_KEY = "aqsha:sidebar:workspaces-collapsed";
const SIDEBAR_SECTION_EVENT = "aqsha:sidebar-section-toggle";
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
  workspaces = emptyWorkspaces,
  selectedWorkspaceId,
  threads,
  selectedThreadId,
  onCreateThread,
  createWorkspace,
  removeThread,
  togglePinThread,
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
  togglePinThread?: TogglePinThread;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const sortedWorkspaces = workspaces.toSorted(
    (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
  );
  const sortedThreads = threads.toSorted(
    (left, right) => right.lastActivityAt - left.lastActivityAt,
  );
  // Thread yang disematkan diangkat ke grup "Disematkan" (urut pinnedAt DESC — pin terbaru
  // dulu). Sisanya (unpinned) dipisah recent/older dari BE (ThreadService.list `bucket`).
  const pinnedThreads = threads
    .filter((t) => t.pinnedAt != null)
    .toSorted((left, right) => (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0));
  const unpinnedThreads = sortedThreads.filter((t) => t.pinnedAt == null);
  const threadGroups = {
    recent: unpinnedThreads.filter((t) => t.bucket !== "older"),
    older: unpinnedThreads.filter((t) => t.bucket === "older"),
  };
  const isHomeActive = pathname === "/app" && !selectedThreadId;
  const isWorkspaceRoute = pathname.startsWith("/app/workspaces");
  const isExploreActive = pathname.startsWith("/app/explore");
  const showWorkspaceSection =
    sortedWorkspaces.length > 0 || Boolean(createWorkspace);
  const showThreadSection = sortedThreads.length > 0 || Boolean(onCreateThread);
  const hasSidebarItems = showWorkspaceSection || showThreadSection;
  // Shared by the sidebar plus-button popover and the Cmd+K "Workspace baru"
  // dialog so both entry points create + navigate identically.
  const submitCreateWorkspace = createWorkspace
    ? async ({ name }: { name: string }) => {
        const workspaceId = await createWorkspace({ name });
        router.push(`/app/workspaces/${String(workspaceId)}`);
      }
    : null;
  const workspaceSectionAction = submitCreateWorkspace ? (
    <CreateWorkspacePopover onSubmit={submitCreateWorkspace} />
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

  const handleTogglePin = async (thread: ThreadSummary) => {
    if (!togglePinThread) return;
    await togglePinThread({
      threadId: thread.threadId,
      pinned: thread.pinnedAt == null,
    });
  };

  return (
    <>
      <Sidebar
        collapsible="offcanvas"
        variant="transparent"
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
                    <SidebarSection
                      label="Workspaces"
                      first
                      action={workspaceSectionAction}
                      collapsible
                      storageKey={WORKSPACES_COLLAPSED_STORAGE_KEY}
                    >
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
                        <EmptyWorkspaceRow />
                      )}
                    </SidebarSection>
                  ) : null}
                  {showThreadSection ? (
                    <SidebarSection
                      label="Threads"
                      action={threadSectionAction}
                      collapsible
                      storageKey={THREADS_COLLAPSED_STORAGE_KEY}
                    >
                      {sortedThreads.length > 0 ? (
                        <div className="min-w-0 overflow-hidden">
                          <SidebarMenu className="min-w-0 gap-1 overflow-hidden">
                            {pinnedThreads.length > 0 ? (
                              <>
                                <PinnedThreadsLabel />
                                {pinnedThreads.map((thread) => (
                                  <RecentThreadRow
                                    key={thread.threadId}
                                    thread={thread}
                                    active={thread.threadId === selectedThreadId}
                                    onDelete={
                                      removeThread
                                        ? () => handleDeleteThread(thread)
                                        : undefined
                                    }
                                    onTogglePin={
                                      togglePinThread
                                        ? () => handleTogglePin(thread)
                                        : undefined
                                    }
                                  />
                                ))}
                              </>
                            ) : null}
                            {threadGroups.recent.map((thread) => (
                              <RecentThreadRow
                                key={thread.threadId}
                                thread={thread}
                                active={thread.threadId === selectedThreadId}
                                onDelete={
                                  removeThread
                                    ? () => handleDeleteThread(thread)
                                    : undefined
                                }
                                onTogglePin={
                                  togglePinThread
                                    ? () => handleTogglePin(thread)
                                    : undefined
                                }
                              />
                            ))}
                          </SidebarMenu>
                          {threadGroups.older.length > 0 ? (
                            <ThreadArchiveGroup
                              threads={threadGroups.older}
                              selectedThreadId={selectedThreadId}
                              removeThread={removeThread}
                              togglePinThread={togglePinThread}
                              onDeleteThread={handleDeleteThread}
                              onTogglePin={handleTogglePin}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <EmptyThreadRow />
                      )}
                    </SidebarSection>
                  ) : null}
                </>
              )}
            </div>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="mt-auto gap-3 p-3">
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
              <CommandGroup heading="Buka">
                <CommandItem
                  value="buka-beranda"
                  onSelect={() => setCommandOpen(false)}
                  asChild
                >
                  <Link href="/app">
                    <HomeIcon className="size-4" />
                    Beranda
                  </Link>
                </CommandItem>
                <CommandItem
                  value="buka-jelajahi"
                  onSelect={() => setCommandOpen(false)}
                  asChild
                >
                  <Link href="/app/explore">
                    <TrendingUpIcon className="size-4" />
                    Jelajahi
                  </Link>
                </CommandItem>
                <CommandItem
                  value="buka-pengaturan"
                  onSelect={() => setCommandOpen(false)}
                  asChild
                >
                  <Link href="/app/settings">
                    <SettingsIcon className="size-4" />
                    Pengaturan
                  </Link>
                </CommandItem>
              </CommandGroup>
              {sortedWorkspaces.length > 0 ? (
                <CommandGroup heading="Workspaces">
                  {sortedWorkspaces.map((workspace) => (
                    <CommandItem
                      key={workspace._id}
                      value={`workspace-${workspace._id}`}
                      keywords={[workspace.name]}
                      onSelect={() => setCommandOpen(false)}
                      asChild
                    >
                      <Link href={`/app/workspaces/${workspace._id}`}>
                        <WorkspaceEmojiGlyph emoji={workspace.emoji} />
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
                      value={`thread-${thread.threadId}`}
                      keywords={[thread.title]}
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
      {submitCreateWorkspace ? (
        <NameDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          title="Workspace baru"
          description="Buat area riset personal."
          submitLabel="Buat"
          onSubmit={submitCreateWorkspace}
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

function usePersistentCollapse(
  storageKey: string | undefined,
  defaultCollapsed = false,
) {
  const subscribe = (onStoreChange: () => void) => {
    if (!storageKey) return () => {};
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(SIDEBAR_SECTION_EVENT, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener(SIDEBAR_SECTION_EVENT, onStoreChange);
    };
  };

  const collapsed = useSyncExternalStore(
    subscribe,
    () => {
      if (!storageKey) return false;
      const stored = window.localStorage.getItem(storageKey);
      return stored === null ? defaultCollapsed : stored === "1";
    },
    () => false,
  );

  const toggle = () => {
    if (!storageKey) return;
    const next = window.localStorage.getItem(storageKey) === "1" ? "0" : "1";
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event(SIDEBAR_SECTION_EVENT));
  };

  return [collapsed, toggle] as const;
}

function SidebarSection({
  label,
  children,
  first,
  action,
  collapsible,
  storageKey,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
  action?: ReactNode;
  collapsible?: boolean;
  storageKey?: string;
}) {
  const [collapsed, toggleCollapsed] = usePersistentCollapse(
    collapsible ? storageKey : undefined,
  );
  // Enable the open/close animation only after the first client frame so a
  // restored-collapsed state appears instantly instead of animating on load.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!collapsible) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [collapsible]);

  const labelClass =
    "text-[11px] font-medium tracking-[-0.01em] text-primary/75";

  return (
    <div className="min-w-0 overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between gap-1 px-0.5 pb-1.5",
          first ? "pt-0" : "pt-1",
        )}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className="-ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-[5px] px-1 py-0.5 text-left transition-[background-color] duration-150 ease-out hover:bg-muted/50"
          >
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-primary/60",
                animate ? "transition-transform duration-200 ease-out" : null,
                collapsed ? "rotate-0" : "rotate-90",
              )}
            />
            <span className={cn(labelClass, "truncate")}>{label}</span>
          </button>
        ) : (
          <span className={labelClass}>{label}</span>
        )}
        {action}
      </div>
      {collapsible ? (
        <div
          className={cn(
            "grid",
            animate
              ? "transition-[grid-template-rows] duration-200 ease-out"
              : null,
            collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function ThreadArchiveGroup({
  threads,
  selectedThreadId,
  removeThread,
  togglePinThread,
  onDeleteThread,
  onTogglePin,
}: {
  threads: ThreadSummary[];
  selectedThreadId?: string;
  removeThread?: RemoveThread;
  togglePinThread?: TogglePinThread;
  onDeleteThread: (thread: ThreadSummary) => Promise<void>;
  onTogglePin: (thread: ThreadSummary) => Promise<void>;
}) {
  const hasActiveThread = threads.some(
    (thread) => thread.threadId === selectedThreadId,
  );
  const [persistedCollapsed, toggleCollapsed] = usePersistentCollapse(
    OLD_THREADS_COLLAPSED_STORAGE_KEY,
    true,
  );
  const [animate, setAnimate] = useState(false);
  const collapsed = hasActiveThread ? false : persistedCollapsed;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-w-0 overflow-hidden pt-1">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="-ml-1 flex min-w-0 items-center gap-1 rounded-[5px] px-1 py-0.5 text-left transition-[background-color] duration-150 ease-out hover:bg-muted/50"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-primary/55",
            animate ? "transition-transform duration-200 ease-out" : null,
            collapsed ? "rotate-0" : "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
          More
        </span>
        <span className="shrink-0 rounded-[5px] bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
          {threads.length}
        </span>
      </button>
      <div
        className={cn(
          "grid",
          animate
            ? "transition-[grid-template-rows] duration-200 ease-out"
            : null,
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden pt-1">
          <SidebarMenu className="min-w-0 gap-1 overflow-hidden">
            {threads.map((thread) => (
              <RecentThreadRow
                key={thread.threadId}
                thread={thread}
                active={thread.threadId === selectedThreadId}
                onDelete={
                  removeThread ? () => onDeleteThread(thread) : undefined
                }
                onTogglePin={
                  togglePinThread ? () => onTogglePin(thread) : undefined
                }
              />
            ))}
          </SidebarMenu>
        </div>
      </div>
    </div>
  );
}

function PinnedThreadsLabel() {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className="flex items-center gap-1 px-1"
    >
      <PinIcon className="size-3 shrink-0 text-primary/60" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
        Disematkan
      </span>
    </li>
  );
}

function RecentThreadRow({
  thread,
  active,
  onDelete,
  onTogglePin,
}: {
  thread: ThreadSummary;
  active: boolean;
  onDelete?: () => Promise<void>;
  onTogglePin?: () => Promise<void>;
}) {
  const deleteDescription = thread.workspaceId
    ? "Thread dan pesannya akan dihapus permanen dari workspace ini."
    : "Thread dan pesannya akan dihapus permanen.";
  const isPinned = thread.pinnedAt != null;

  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        size="sm"
        isActive={active}
        className={cn(
          sidebarItemClass(active),
          "w-full min-w-0 max-w-full overflow-hidden",
          onDelete ? "pr-8" : undefined,
        )}
      >
        <Link
          href={`/app/threads/${thread.threadId}`}
          aria-label={thread.title}
          title={thread.title}
          className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden"
        >
          <MessageSquareIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-normal">
            {truncateCharacters(thread.title, MOBILE_THREAD_TITLE_MAX_CHARS)}
          </span>
          {isPinned ? (
            <PinIcon className="size-3 shrink-0 text-primary/50" />
          ) : null}
          {thread.status === "streaming" ? (
            <span className="inline-flex size-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
        </Link>
      </SidebarMenuButton>
      {onDelete ? (
        <ThreadActionsMenu
          variant="sidebar-row"
          description={deleteDescription}
          onDelete={onDelete}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
        />
      ) : null}
    </SidebarMenuItem>
  );
}

function EmptyWorkspaceRow() {
  return (
    <div className="rounded-[8px] border border-dashed border-border/70 px-2.5 py-2 text-[11px] font-medium leading-5 text-muted-foreground">
      Belum ada workspace.
    </div>
  );
}

function EmptyThreadRow() {
  return (
    <div className="rounded-[8px] border border-dashed border-border/70 px-2.5 py-2 text-[11px] font-medium leading-5 text-muted-foreground">
      Belum ada thread.
    </div>
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
          <WorkspaceEmojiGlyph emoji={workspace.emoji} active={active} />
          <span className="min-w-0 flex-1 truncate font-normal">
            {workspace.name}
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function WorkspaceEmojiGlyph({
  emoji,
  active,
}: {
  emoji?: string;
  active?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[13px] leading-none",
        active ? "bg-background/70" : "bg-muted/35",
      )}
    >
      {emoji?.trim() || "📚"}
    </span>
  );
}

function truncateCharacters(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
}
