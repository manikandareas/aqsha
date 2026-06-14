"use client";

import { MessageSquarePlusIcon, PanelLeftIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import { SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import {
  panelBodyPaddingClass,
  panelHeaderPaddingClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { AccessDeniedState } from "./access-denied-state";
import { ThreadChatSurface } from "./chat-thread-state";
import { ThreadDeleteActions } from "./thread-actions-menu";
import { ThreadRecentSwitcher } from "./thread-recent-switcher";
import type {
  DraftContextArtifact,
  SendMessage,
  StartThread,
  ThreadSummary,
} from "./component-types";
import type { AgentRunId } from "@/lib/convex-refs";
import type {
  RateStatus,
  ResearchArtifact,
  ResearchRun,
  ResearchSource,
} from "../types";

type ActivePanelThread =
  | {
      title?: string;
      workspaceId?: string;
    }
  | null
  | undefined;

export function CompactThreadChatPanel({
  activeThreadId,
  activeThread,
  threads,
  onActiveThreadIdChange,
  deleteDescription,
  onDeleteThread,
  rateStatus,
  startThread,
  onSend,
  runs,
  artifacts,
  sources,
  onCancelRun,
  onRetryRun,
  contextArtifacts,
  onRemoveContextArtifact,
  threadWorkspaceId,
  draftContextLabel,
  seed,
}: {
  activeThreadId: string | null;
  activeThread: ActivePanelThread;
  threads: ThreadSummary[];
  onActiveThreadIdChange: (threadId: string | null) => void;
  deleteDescription: string;
  onDeleteThread: () => Promise<unknown>;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  onSend?: SendMessage;
  runs?: ResearchRun[];
  artifacts?: ResearchArtifact[];
  sources?: ResearchSource[];
  onCancelRun?: (runId: string) => Promise<unknown>;
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  threadWorkspaceId?: string;
  draftContextLabel?: string;
  seed?: string;
}) {
  const closePanel = useCloseRightPanel();
  const headerLabel = activeThread?.title ?? "Chat baru";

  return (
    <>
      <SidebarHeader
        className={cn(
          "gap-0 border-b-0 bg-background p-0",
          panelHeaderPaddingClass,
        )}
      >
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
                description={deleteDescription}
                onDelete={async () => {
                  await onDeleteThread();
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
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto",
                panelBodyPaddingClass,
              )}
            >
              <AccessDeniedState />
            </div>
          ) : (
            <ThreadChatSurface
              threadId={activeThreadId}
              isLoading={activeThread === undefined}
              title={activeThread?.title}
              rateStatus={rateStatus}
              startThread={startThread}
              onSend={onSend}
              runs={runs}
              artifacts={artifacts}
              sources={sources}
              onCancelRun={onCancelRun}
              onRetryRun={onRetryRun}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              threadWorkspaceId={threadWorkspaceId ?? activeThread?.workspaceId}
              compact
            />
          )
        ) : (
          <ThreadChatSurface
            isLoading={false}
            rateStatus={rateStatus}
            startThread={startThread}
            threads={threads}
            contextArtifacts={contextArtifacts}
            onRemoveContextArtifact={onRemoveContextArtifact}
            onThreadCreated={onActiveThreadIdChange}
            draftContextLabel={draftContextLabel}
            threadWorkspaceId={threadWorkspaceId}
            seed={seed}
            compact
          />
        )}
      </SidebarContent>
    </>
  );
}
