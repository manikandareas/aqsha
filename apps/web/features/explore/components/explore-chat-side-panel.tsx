"use client";

import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { CompactThreadChatPanel } from "@/features/thread-experience/components/compact-thread-chat-panel";
import type {
  SendMessage,
  StartThread,
} from "@/features/thread-experience/components/component-types";
import { toMutationContextSnapshot } from "@/features/thread-experience/utils/message-context";

// Global (workspace-less) chat panel for the Explore surfaces. Mirrors
// WorkspaceChatSidePanel — same thread switcher, new/delete/close chrome, and
// compact ThreadChatSurface — but drives everything off the global thread
// experience instead of a workspace. The optional `seed` pre-fills the
// new-chat composer with the detail item the user is reading.
export function ExploreChatSidePanel({
  activeThreadId,
  onActiveThreadIdChange,
  seed,
}: {
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  seed?: string;
}) {
  const data = useThreadExperienceData(activeThreadId ?? undefined);
  const activeThread = activeThreadId ? data.selectedThread : undefined;

  // The raw mutations carry branded Convex ids; brand the snapshot before
  // forwarding so the composer's StartThread/SendMessage contracts line up.
  const startThread: StartThread = (args) =>
    data.startThread({
      ...args,
      contextArtifactSnapshot: toMutationContextSnapshot(
        args.contextArtifactSnapshot,
      ),
    });
  const sendMessage: SendMessage = (args) =>
    data.sendMessage({
      ...args,
      contextArtifactSnapshot: toMutationContextSnapshot(
        args.contextArtifactSnapshot,
      ),
    });

  return (
    <CompactThreadChatPanel
      activeThreadId={activeThreadId}
      activeThread={activeThread}
      threads={data.threads}
      onActiveThreadIdChange={onActiveThreadIdChange}
      deleteDescription="Thread dan pesannya akan dihapus permanen."
      onDeleteThread={() =>
        activeThreadId
          ? data.removeThread({ threadId: activeThreadId })
          : Promise.resolve()
      }
      rateStatus={data.rateStatus}
      startThread={startThread}
      onSend={sendMessage}
      runs={data.runs}
      artifacts={data.artifacts}
      sources={data.sources}
      onCancelRun={data.cancelRun}
      onRetryRun={data.retryRun}
      threadWorkspaceId={activeThread?.workspaceId}
      seed={seed}
    />
  );
}
