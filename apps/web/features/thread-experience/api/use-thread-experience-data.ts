"use client";

import { useAuth } from "@clerk/nextjs";
import { useDeleteThread, useSendStatus, useThread } from "@/features/threads/api";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";
import {
  deriveRateStatus,
  deriveSelectedThread,
} from "../utils/thread-experience-model";

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

  // Gate cached query data on `authReady` inside the derivations: a disabled query still
  // holds the previous user's data, which must not surface after sign-out / account switch.
  const selectedThread = deriveSelectedThread({
    threadId,
    authReady,
    isLoading: selectedThreadQuery.isLoading,
    data: selectedThreadQuery.data,
  });

  return {
    workspaces: index.workspaces,
    threads,
    selectedThread,
    rateStatus: deriveRateStatus(authReady, rateStatus.data),
    removeThread: async (args: { threadId: string }) => {
      await removeThreadMutation.mutateAsync({ id: args.threadId });
      return { ok: true as const };
    },
  };
}
