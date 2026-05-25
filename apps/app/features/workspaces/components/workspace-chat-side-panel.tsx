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
import { SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { toArtifactIds } from "@/lib/convex-refs";
import { panelBodyPaddingClass, panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { ChatThreadState } from "@/features/thread-experience/components/chat-thread-state";
import type {
  StartThread,
  ThreadSummary,
} from "@/features/thread-experience/components/component-types";
import { Composer } from "@/features/thread-experience/components/composer";
import { AccessDeniedState } from "@/features/thread-experience/components/home-states";
import { ThreadDeleteActions } from "@/features/thread-experience/components/thread-actions-menu";
import type { RateStatus } from "@/features/thread-experience/types";

type RemoveThread = (args: { threadId: string }) => Promise<{ ok: true }>;

export function WorkspaceChatSidePanel({
  workspaceName,
  activeThreadId,
  onActiveThreadIdChange,
  threads,
  contextArtifacts,
  selectedContextArtifactIds,
  onRemoveContextArtifact,
  onContextPersisted,
  rateStatus,
  startThread,
  removeThread,
}: {
  workspaceName: string;
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  threads: ThreadSummary[];
  contextArtifacts: Array<{ artifactId: string; title: string }>;
  selectedContextArtifactIds: string[];
  onRemoveContextArtifact: (artifactId: string) => void;
  onContextPersisted: (artifactIds: string[]) => void;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  removeThread: RemoveThread;
}) {
  const closePanel = useCloseRightPanel();
  const threadExperience = useThreadExperienceData(activeThreadId ?? undefined);
  const recentThreads = useMemo(
    () => threads.toSorted((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 4),
    [threads],
  );
  const activeThread = activeThreadId ? threadExperience.selectedThread : undefined;
  const headerLabel = activeThread?.title ?? "Chat baru";
  const sendWithDraftContext = async (
    args: Parameters<typeof threadExperience.sendMessage>[0],
  ) => {
    const result = await threadExperience.sendMessage({
      ...args,
      selectedContextArtifactIds: toArtifactIds(selectedContextArtifactIds),
    });
    if (result.ok) {
      onContextPersisted(selectedContextArtifactIds);
    }
    return result;
  };

  return (
    <>
      <SidebarHeader className={cn("gap-0 border-b-0 bg-background p-0", panelHeaderPaddingClass)}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-w-0 max-w-[min(100%,12rem)] gap-1 rounded-full px-0 py-0 text-[13px] font-normal leading-none text-foreground hover:bg-transparent hover:text-foreground"
              >
                <span className="truncate">{headerLabel}</span>
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
              <DropdownMenuItem onClick={() => onActiveThreadIdChange(null)}>
                Chat baru
              </DropdownMenuItem>
              {recentThreads.length === 0 ? (
                <DropdownMenuItem disabled>Belum ada thread</DropdownMenuItem>
              ) : (
                recentThreads.map((thread) => (
                  <DropdownMenuItem
                    key={thread.threadId}
                    onClick={() => onActiveThreadIdChange(thread.threadId)}
                  >
                    <span className="truncate">{thread.title}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex shrink-0 items-center gap-1">
            {activeThreadId ? (
              <ThreadDeleteActions
                description="Thread dan pesannya akan dihapus permanen dari workspace ini."
                onDelete={async () => {
                  await removeThread({ threadId: activeThreadId });
                  onActiveThreadIdChange(null);
                }}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Chat baru"
              onClick={() => onActiveThreadIdChange(null)}
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
        {activeThreadId ? (
          activeThread === null ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <AccessDeniedState />
            </div>
          ) : (
            <ChatThreadState
              threadId={activeThreadId}
              isLoading={activeThread === undefined}
              title={activeThread?.title}
              recentThreads={recentThreads}
              rateStatus={rateStatus}
              startThread={startThread}
              onSend={sendWithDraftContext}
              runs={threadExperience.runs}
              artifacts={threadExperience.artifacts}
              sources={threadExperience.sources}
              onCancelRun={threadExperience.cancelRun}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              compact
            />
          )
        ) : (
          <WorkspacePanelDraftView
            workspaceName={workspaceName}
            contextArtifacts={contextArtifacts}
            onRemoveContextArtifact={onRemoveContextArtifact}
            rateStatus={rateStatus}
            startThread={startThread}
            onThreadCreated={onActiveThreadIdChange}
          />
        )}
      </SidebarContent>
    </>
  );
}

function WorkspacePanelDraftView({
  workspaceName,
  contextArtifacts,
  onRemoveContextArtifact,
  rateStatus,
  startThread,
  onThreadCreated,
}: {
  workspaceName: string;
  contextArtifacts: Array<{ artifactId: string; title: string }>;
  onRemoveContextArtifact: (artifactId: string) => void;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  onThreadCreated: (threadId: string) => void;
}) {
  return (
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
        </div>
        <Composer
          disabled={false}
          rateStatus={rateStatus}
          onStartThread={startThread}
          onSend={async () => ({ ok: true, messageId: "" })}
          onThreadCreated={onThreadCreated}
          contextArtifacts={contextArtifacts}
          onRemoveContextArtifact={onRemoveContextArtifact}
        />
        <p className="max-w-sm text-[12px] text-muted-foreground">
          Pilih item di board (klik sekali) atau ketik / untuk perintah riset
        </p>
      </div>
    </div>
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

export function WorkspaceLoading() {
  return (
    <div className="grid gap-4 px-4 py-5 sm:px-6">
      <p className="text-[12px] font-medium text-muted-foreground">Memuat workspace...</p>
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function WorkspaceMissing() {
  return (
    <div className="grid min-h-svh place-items-center px-4 text-center">
      <div className="grid gap-3">
        <h1 className="font-heading text-2xl font-semibold">Workspace tidak tersedia.</h1>
        <p className="text-[13px] font-medium text-muted-foreground">
          Workspace ini tidak ditemukan untuk akun yang sedang masuk.
        </p>
      </div>
    </div>
  );
}
