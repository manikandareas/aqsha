"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { toWorkspaceId } from "@/lib/convex-refs";
import { cn } from "@/lib/utils";
import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { CompactThreadChatPanel } from "@/features/thread-experience/components/compact-thread-chat-panel";
import type {
  StartThread,
  ThreadSummary,
} from "@/features/thread-experience/components/component-types";
import type { RateStatus } from "@/features/thread-experience/types";

export function WorkspaceChatSidePanel({
  workspaceId,
  activeThreadId,
  onActiveThreadIdChange,
  threads,
  rateStatus,
}: {
  workspaceId: string;
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  threads: ThreadSummary[];
  rateStatus: RateStatus | undefined;
}) {
  const threadExperience = useThreadExperienceData(activeThreadId ?? undefined);
  const activeThread = activeThreadId
    ? threadExperience.selectedThread
    : undefined;
  // New threads are filed under this workspace; pinned context is owned by the
  // composer's inline pills (mention provider). This adapter injects the
  // workspace before forwarding to the agent backend (mirrors ExploreChatSidePanel,
  // which is workspace-less).
  const startThread: StartThread = (args) =>
    threadExperience.startThread({
      ...args,
      workspaceId: toWorkspaceId(workspaceId),
    });
  const sendMessage = threadExperience.sendMessage;

  return (
    <CompactThreadChatPanel
      activeThreadId={activeThreadId}
      activeThread={activeThread}
      threads={threads}
      onActiveThreadIdChange={onActiveThreadIdChange}
      deleteDescription="Thread dan pesannya akan dihapus permanen dari workspace ini."
      onDeleteThread={() =>
        activeThreadId
          ? threadExperience.removeThread({ threadId: activeThreadId })
          : Promise.resolve()
      }
      rateStatus={rateStatus}
      startThread={startThread}
      onSend={sendMessage}
      runs={threadExperience.runs}
      artifacts={threadExperience.artifacts}
      sources={threadExperience.sources}
      onCancelRun={threadExperience.cancelRun}
      onRetryRun={threadExperience.retryRun}
      threadWorkspaceId={workspaceId}
    />
  );
}

function WorkspaceLoading() {
  return (
    <div className={cn("grid gap-4", panelBodyPaddingClass)}>
      <p className="text-[12px] font-medium text-muted-foreground">
        Memuat workspace…
      </p>
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
        <h1 className="font-heading text-2xl font-semibold">
          Workspace tidak tersedia.
        </h1>
        <p className="text-[13px] font-medium text-muted-foreground">
          Workspace ini tidak ditemukan untuk akun yang sedang masuk.
        </p>
      </div>
    </div>
  );
}
