"use client";

// Chat Astra untuk surface Explore. Cermin WorkspaceChatSidePanel tetapi
// workspace-less: thread baru lahir headless (sama seperti /app). Self-contained —
// threads + rateStatus dibaca langsung dari hook, jadi parent cukup pegang
// activeThreadId. Hanya mount saat panel terbuka (ResponsiveSidePanel).

import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { CompactThreadChatPanel } from "@/features/thread-experience/components/compact-thread-chat-panel";

export function ExploreChatSidePanel({
  activeThreadId,
  onActiveThreadIdChange,
}: {
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
}) {
  const threadExperience = useThreadExperienceData(activeThreadId ?? undefined);
  const activeThread = activeThreadId ? threadExperience.selectedThread : undefined;

  return (
    <CompactThreadChatPanel
      activeThreadId={activeThreadId}
      activeThread={activeThread}
      threads={threadExperience.threads}
      onActiveThreadIdChange={onActiveThreadIdChange}
      deleteDescription="Thread dan pesannya akan dihapus permanen."
      onDeleteThread={() =>
        activeThreadId
          ? threadExperience.removeThread({ threadId: activeThreadId })
          : Promise.resolve()
      }
      rateStatus={threadExperience.rateStatus}
      startThread={threadExperience.startThread}
      onSend={threadExperience.sendMessage}
      runs={threadExperience.runs}
      artifacts={threadExperience.artifacts}
      sources={threadExperience.sources}
      onCancelRun={threadExperience.cancelRun}
      onRetryRun={threadExperience.retryRun}
    />
  );
}
