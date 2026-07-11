"use client";

import { useDeleteThread, useSendStatus, useThread } from "@/features/threads/api";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";

export function useThreadExperienceData(threadId: string | undefined) {
  const index = useWorkspaceIndexData();
  const selectedThreadQuery = useThread(threadId ?? "");
  const rateStatus = useSendStatus();
  const removeThreadMutation = useDeleteThread();

  // Pakai daftar gabungan dari index (pinned + list utama, sudah di-dedup) supaya thread yang
  // disematkan tetap muncul di quick-switcher header — `useThreadsList` sendiri kini exclude pin.
  const threads = index.threads;

  const selectedThread =
    threadId && selectedThreadQuery.data
      ? {
          threadId: selectedThreadQuery.data.id,
          title: selectedThreadQuery.data.title?.trim()
            ? selectedThreadQuery.data.title
            : "Percakapan baru",
          workspaceId: selectedThreadQuery.data.workspaceId ?? undefined,
          status: selectedThreadQuery.data.status,
        }
      : threadId
        ? selectedThreadQuery.isLoading
          ? undefined
          : null
        : undefined;

  return {
    workspaces: index.workspaces,
    threads,
    selectedThread,
    rateStatus: rateStatus.data
      ? ({
          ok: rateStatus.data.canSend,
          serverTime: 0,
          canSend: rateStatus.data.canSend,
          reason: rateStatus.data.reason,
          retryAt: rateStatus.data.retryAt,
        } as const)
      : undefined,
    removeThread: async (args: { threadId: string }) => {
      await removeThreadMutation.mutateAsync({ id: args.threadId });
      return { ok: true as const };
    },
  };
}
