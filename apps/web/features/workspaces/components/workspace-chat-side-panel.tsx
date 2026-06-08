"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import {
  threadContextScopeKey,
  useDraftContextSelection,
} from "@/lib/thread-context-draft-store";
import { cn } from "@/lib/utils";
import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { CompactThreadChatPanel } from "@/features/thread-experience/components/compact-thread-chat-panel";
import type {
  RemoveThread,
  SendMessage,
  StartThread,
  ThreadSummary,
} from "@/features/thread-experience/components/component-types";
import type { RateStatus } from "@/features/thread-experience/types";
import {
  buildContextArtifactSnapshot,
  toMutationContextSnapshot,
  toSelectedContextArtifactIds,
} from "@/features/thread-experience/utils/message-context";

export function WorkspaceChatSidePanel({
  workspaceName,
  workspaceId,
  activeThreadId,
  onActiveThreadIdChange,
  threads,
  contextArtifacts,
  onRemoveContextArtifact,
  rateStatus,
  startThread,
  removeThread,
}: {
  workspaceName: string;
  workspaceId: string;
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  threads: ThreadSummary[];
  contextArtifacts: Array<{ artifactId: string; title: string }>;
  onRemoveContextArtifact: (artifactId: string) => void;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  removeThread: RemoveThread;
}) {
  const threadExperience = useThreadExperienceData(activeThreadId ?? undefined);
  const activeThread = activeThreadId
    ? threadExperience.selectedThread
    : undefined;
  const persistedThreadContextIds =
    threadExperience.selectedContextArtifacts.map((item) =>
      String(item.artifactId),
    );
  const threadDraftContext = useDraftContextSelection(
    activeThreadId
      ? threadContextScopeKey(activeThreadId)
      : "workspace-panel:none",
    activeThreadId && threadExperience.selectedContextArtifactsLoaded
      ? persistedThreadContextIds
      : undefined,
  );
  const threadContextTitleById = (() => {
    const titles = new Map<string, string>();
    for (const item of threadExperience.selectedContextArtifacts) {
      titles.set(String(item.artifactId), item.artifact.title);
    }
    for (const artifact of contextArtifacts) {
      titles.set(artifact.artifactId, artifact.title);
    }
    return titles;
  })();
  const activeContextArtifacts = activeThreadId
    ? threadDraftContext.selectedIds.map((artifactId) => ({
        artifactId,
        title: threadContextTitleById.get(artifactId) ?? "Artifact",
      }))
    : contextArtifacts;
  const sendWithDraftContext: SendMessage = async (args) => {
    const shouldReplaceContext = threadDraftContext.isDirty;
    const messageAttachmentIds =
      args.messageAttachmentArtifactIds?.map(String) ?? [];
    const panelIds = shouldReplaceContext
      ? threadDraftContext.selectedIds
      : persistedThreadContextIds;
    const snapshotIds = [...new Set([...panelIds, ...messageAttachmentIds])];
    const contextArtifactSnapshot = buildContextArtifactSnapshot(
      snapshotIds,
      threadContextTitleById,
      messageAttachmentIds,
    );
    const panelSnapshot = shouldReplaceContext
      ? buildContextArtifactSnapshot(
          threadDraftContext.selectedIds,
          threadContextTitleById,
        )
      : undefined;
    const result = await threadExperience.sendMessage({
      ...args,
      selectedContextArtifactIds: toSelectedContextArtifactIds(panelSnapshot),
      contextArtifactSnapshot: toMutationContextSnapshot(
        contextArtifactSnapshot,
      ),
    });
    if (result.ok && shouldReplaceContext) {
      threadDraftContext.markSelectionPersisted(threadDraftContext.selectedIds);
    }
    return result;
  };

  return (
    <CompactThreadChatPanel
      activeThreadId={activeThreadId}
      activeThread={activeThread}
      threads={threads}
      onActiveThreadIdChange={onActiveThreadIdChange}
      deleteDescription="Thread dan pesannya akan dihapus permanen dari workspace ini."
      onDeleteThread={() =>
        activeThreadId
          ? removeThread({ threadId: activeThreadId })
          : Promise.resolve()
      }
      rateStatus={rateStatus}
      startThread={startThread}
      onSend={sendWithDraftContext}
      runs={threadExperience.runs}
      artifacts={threadExperience.artifacts}
      sources={threadExperience.sources}
      onCancelRun={threadExperience.cancelRun}
      onRetryRun={threadExperience.retryRun}
      contextArtifacts={activeContextArtifacts}
      onRemoveContextArtifact={
        activeThreadId ? threadDraftContext.toggleArtifact : onRemoveContextArtifact
      }
      threadWorkspaceId={workspaceId}
      draftContextLabel={workspaceName}
    />
  );
}

export function WorkspaceLoading() {
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
