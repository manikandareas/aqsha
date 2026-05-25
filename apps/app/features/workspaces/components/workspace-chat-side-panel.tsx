"use client";

import { MessageSquarePlusIcon, PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import { toArtifactIds } from "@/lib/convex-refs";
import { panelBodyPaddingClass, panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { ChatThreadState } from "@/features/thread-experience/components/chat-thread-state";
import type {
  RemoveThread,
  StartThread,
  ThreadSummary,
} from "@/features/thread-experience/components/component-types";
import { ComposerHeroState } from "@/features/thread-experience/components/composer-hero-state";
import { Composer } from "@/features/thread-experience/components/composer";
import { AccessDeniedState } from "@/features/thread-experience/components/home-states";
import { ThreadDeleteActions } from "@/features/thread-experience/components/thread-actions-menu";
import { ThreadRecentSwitcher } from "@/features/thread-experience/components/thread-recent-switcher";
import type { RateStatus } from "@/features/thread-experience/types";

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
          <ThreadRecentSwitcher
            title={headerLabel}
            threads={threads}
            onSelectThread={onActiveThreadIdChange}
            onNewThread={() => onActiveThreadIdChange(null)}
            newLabel="Chat baru"
            emptyLabel="Belum ada thread"
          />
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
      <ComposerHeroState
        logoClassName="size-6 text-mint"
        titleClassName="font-heading text-xl font-bold tracking-tight text-foreground leading-none"
        hint="Pilih item di board (klik sekali) atau ketik / untuk perintah riset"
      >
        <Composer
          variant="docked"
          contextLabel={workspaceName}
          disabled={false}
          rateStatus={rateStatus}
          onStartThread={startThread}
          onThreadCreated={onThreadCreated}
          contextArtifacts={contextArtifacts}
          onRemoveContextArtifact={onRemoveContextArtifact}
        />
      </ComposerHeroState>
    </div>
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
