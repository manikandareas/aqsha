"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import {
  BugIcon,
  MessageSquarePlusIcon,
  PanelLeftIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
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
  useSidebar,
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
  onCreateThread,
  ...props
}: ComponentProps<typeof Sidebar> & {
  viewer: Viewer | undefined;
  threads: ThreadSummary[];
  selectedThreadId?: string;
  onCreateThread: () => void;
}) {
  const grouped = groupThreads(threads);
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
            {grouped.length === 0 ? (
              <div className="mx-1.5 mt-1.5 rounded-[7px] border border-dashed border-sidebar-border bg-muted/25 p-2 text-[12px] text-muted-foreground">
                Belum ada thread.
              </div>
            ) : (
              grouped.map((section) => (
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
        <UpgradeCard />
        <NavUser user={viewer} />
      </SidebarFooter>
    </Sidebar>
  );
}

function UpgradeCard() {
  return (
    <div className="flex min-h-[154px] flex-col rounded-[14px] border border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] px-3 py-3.5 shadow-[0_12px_28px_rgb(154_106_0_/_0.08)] dark:shadow-none">
      <div className="mb-2 inline-flex w-fit items-center gap-1 rounded-full border border-[var(--lemon-soft-border)] bg-background/55 px-2 py-1 text-[11px] font-semibold leading-none text-[var(--lemon)]">
        <SparklesIcon className="size-3" />
        7 hari trial
      </div>
      <h3 className="font-heading text-[15px] font-extrabold leading-[1.18] text-foreground [text-wrap:balance]">
        Starter atau Plus untuk riset panjang
      </h3>
      <p className="mt-1.5 text-[12px] font-medium leading-[1.5] text-muted-foreground">
        Credits bulanan, Deep Research, dan guard biaya provider saat riset mulai serius.
      </p>
      <Button
        asChild
        size="sm"
        className="mt-auto h-9 w-full rounded-[9px] bg-primary text-[13px] font-semibold text-primary-foreground shadow-none transition-transform hover:bg-primary/90 active:scale-[0.985]"
      >
        <Link href="/settings/usage-billing">Lihat paket</Link>
      </Button>
    </div>
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

function groupThreads(threads: ThreadSummary[]): ThreadSection[] {
  if (threads.length === 0) return [];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const buckets: Record<string, ThreadSummary[]> = {
    "Hari ini": [],
    "7 hari terakhir": [],
    Older: [],
  };
  for (const thread of threads) {
    const diff = now - thread.lastActivityAt;
    if (diff < day) buckets["Hari ini"].push(thread);
    else if (diff < 7 * day) buckets["7 hari terakhir"].push(thread);
    else buckets.Older.push(thread);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
