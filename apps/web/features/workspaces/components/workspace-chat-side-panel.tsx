"use client";

import { useThreadExperienceData } from "@/features/thread-experience/api/use-thread-experience-data";
import { CompactThreadChatPanel } from "@/features/thread-experience/components/compact-thread-chat-panel";
import type { ThreadSummary } from "@/features/thread-experience/components/component-types";
import type { RateStatus } from "@/features/thread-experience/types";

// Konteks workspace (pengarsipan thread baru + pill @Workspace) datang dari
// `ComposerMentionsProvider` di shell pemanggil — panel ini murni chat compact.
export function WorkspaceChatSidePanel({
  activeThreadId,
  onActiveThreadIdChange,
  threads,
  rateStatus,
  chrome,
}: {
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  threads: ThreadSummary[];
  rateStatus: RateStatus | undefined;
  /** Diteruskan ke `CompactThreadChatPanel` — `content` saat frame dimiliki shell bertab. */
  chrome?: "frame" | "content";
}) {
  const threadExperience = useThreadExperienceData(activeThreadId ?? undefined);
  const activeThread = activeThreadId
    ? threadExperience.selectedThread
    : undefined;

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
      chrome={chrome}
    />
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
