"use client";

import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { CompactThreadChatPanel } from "@/features/thread-experience/components/compact-thread-chat-panel";
import { ComposerMentionsProvider } from "@/features/thread-experience/components/composer-context-mentions";

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

  return (
    <ComposerMentionsProvider threadId={activeThreadId ?? undefined} ambientWorkspaceId={null}>
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
        startThread={data.startThread}
        onSend={data.sendMessage}
        runs={data.runs}
        artifacts={data.artifacts}
        sources={data.sources}
        onCancelRun={data.cancelRun}
        onRetryRun={data.retryRun}
        threadWorkspaceId={activeThread?.workspaceId}
        seed={seed}
      />
    </ComposerMentionsProvider>
  );
}
