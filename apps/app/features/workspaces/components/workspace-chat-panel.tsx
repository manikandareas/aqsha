"use client";

import {
  ChevronDownIcon,
  MessageSquarePlusIcon,
  PanelLeftIcon,
  XIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { toWorkspaceId } from "@/lib/convex-refs";
import { cn } from "@/lib/utils";
import { Composer } from "@/features/thread-experience/components/composer";
import { panelBodyPaddingClass, panelHeaderPaddingClass } from "@/lib/panel-surface";
import { panelSurfaceClass } from "@/lib/panel-surface";

type WorkspaceChatPanelProps = {
  workspaceId: string;
  workspaceName: string;
  threads: Array<{
    threadId: string;
    title: string;
    lastActivityAt: number;
    status: "idle" | "streaming" | "failed";
  }>;
  contextArtifacts: Array<{ artifactId: string; title: string }>;
  onRemoveContextArtifact: (artifactId: string) => void;
  rateStatus: Parameters<typeof Composer>[0]["rateStatus"];
  startThread: Parameters<typeof Composer>[0]["onStartThread"];
  onOpenThread: (threadId: string) => void;
  onNewChat?: () => void;
};

export function WorkspaceChatPanel(props: WorkspaceChatPanelProps) {
  const { isMobile, open } = useSidebar();

  if (isMobile) {
    return (
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="[&_[data-slot=sidebar-inner]]:bg-background"
      >
        <WorkspaceChatPanelBody {...props} />
      </Sidebar>
    );
  }

  if (!open) {
    return null;
  }

  return (
    <aside className={panelSurfaceClass}>
      <WorkspaceChatPanelBody {...props} />
    </aside>
  );
}

function WorkspaceChatPanelBody({
  workspaceId,
  workspaceName,
  threads,
  contextArtifacts,
  onRemoveContextArtifact,
  rateStatus,
  startThread,
  onOpenThread,
  onNewChat,
}: WorkspaceChatPanelProps) {
  const closePanel = useCloseRightPanel();
  const recentThreads = useMemo(
    () => [...threads].sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 4),
    [threads],
  );

  return (
    <>
      <SidebarHeader className={cn("gap-0 border-b-0 bg-background p-0", panelHeaderPaddingClass)}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-w-0 gap-1 rounded-full px-0 py-0 text-[13px] font-normal leading-none text-foreground hover:bg-transparent hover:text-foreground"
              >
                Chat baru
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
              {recentThreads.length === 0 ? (
                <DropdownMenuItem disabled>Belum ada thread</DropdownMenuItem>
              ) : (
                recentThreads.map((thread) => (
                  <DropdownMenuItem
                    key={thread.threadId}
                    onClick={() => onOpenThread(thread.threadId)}
                  >
                    <span className="truncate">{thread.title}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Chat baru"
              onClick={onNewChat}
            >
              <MessageSquarePlusIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={closePanel}
              aria-label="Tutup panel chat"
            >
              <PanelLeftIcon className="size-3.5 rotate-180" />
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-background p-0">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col justify-center overflow-y-auto",
            panelBodyPaddingClass,
          )}
        >
          <div className="flex w-full flex-col items-center gap-5 text-center">
            <h2 className="max-w-md font-heading text-lg font-semibold leading-snug tracking-tight text-foreground">
              Apa yang ingin kita kerjakan?
            </h2>
            <div className="flex min-h-[28px] flex-wrap items-center justify-center gap-1.5">
              <ContextPill label={workspaceName} locked />
              {contextArtifacts.map((item) => (
                <ContextPill
                  key={item.artifactId}
                  label={item.title}
                  onRemove={() => onRemoveContextArtifact(item.artifactId)}
                />
              ))}
            </div>
            <Composer
              disabled={false}
              rateStatus={rateStatus}
              onStartThread={(args) =>
                startThread({ ...args, workspaceId: toWorkspaceId(workspaceId) })
              }
              onSend={async () => ({ ok: true, messageId: "" })}
            />
            <p className="max-w-sm text-[12px] text-muted-foreground">
              Pilih item di board (klik sekali) atau ketik / untuk perintah riset
            </p>
          </div>
        </div>
      </SidebarContent>
    </>
  );
}

function ContextPill({
  label,
  locked,
  onRemove,
}: {
  label: string;
  locked?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[11rem] items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
        locked
          ? "bg-muted text-muted-foreground"
          : "bg-foreground text-background",
      )}
    >
      <span className="truncate">{label}</span>
      {locked ? null : (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-full p-0.5 text-background/70 hover:bg-background/15 hover:text-background"
          aria-label={`Hapus ${label} dari konteks`}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}
