"use client";

import { useAuth } from "@clerk/nextjs";
import { useDeleteThread, useSendStatus, useThread } from "@/features/threads/api";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";

export function useThreadExperienceData(threadId: string | undefined) {
  // Gate reads until Clerk is ready + signed in so no request fires with a missing token
  // (which would 401 then refetch). `useWorkspaceIndexData` already gates on auth internally;
  // `useDeleteThread` is a mutation (only fires on user action), so it needs no gate.
  const { isLoaded, isSignedIn } = useAuth();
  const authReady = isLoaded && isSignedIn;
  const index = useWorkspaceIndexData();
  const selectedThreadQuery = useThread(threadId ?? "", authReady);
  const rateStatus = useSendStatus("normal_chat", authReady);
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
        ? selectedThreadQuery.isLoading || !authReady
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
