"use client";

import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";
import { useProfile } from "@/features/settings/api";
import {
  useDeleteThread,
  useSendStatus,
  useThread,
  useThreadArtifacts,
  useThreadSources,
  useThreadsList,
} from "@/features/threads/api";
import type { SendMessage, StartThread } from "../components/component-types";
import type { ResearchArtifact, ResearchRun, ResearchSource, SendResult } from "../types";
import { useWorkspaceIndexData } from "@/features/workspaces/api/use-workspaces-data";

function mapThreadSummary(
  thread: {
    id: string;
    title: string | null;
    lastActivityAt: number;
    lastMessagePreview: string | null;
    status: string;
    agentKind: string;
    createdAt: number;
  },
) {
  return {
    threadId: thread.id,
    title: thread.title?.trim() ? thread.title : "Percakapan baru",
    createdAt: thread.createdAt,
    lastActivityAt: thread.lastActivityAt,
    lastMessagePreview: thread.lastMessagePreview ?? "",
    messageCount: 0,
    status: thread.status as "idle" | "streaming" | "failed",
    lastAgentKind: thread.agentKind as "lite" | "pro" | undefined,
  };
}

export function useThreadExperienceData(threadId: string | undefined, enabled = true) {
  const { isLoaded, isSignedIn } = useAuth();
  const active = enabled && isLoaded && isSignedIn;
  const profile = useProfile();
  const index = useWorkspaceIndexData();
  const threadsQuery = useThreadsList();
  const selectedThreadQuery = useThread(threadId ?? "");
  const rateStatus = useSendStatus();
  const sourcesQuery = useThreadSources(threadId ?? "", Boolean(threadId && active));
  const artifactsQuery = useThreadArtifacts(threadId ?? null);
  const removeThreadMutation = useDeleteThread();

  const threads = useMemo(
    () =>
      (threadsQuery.data?.pages ?? [])
        .flatMap((page) => page.items)
        .map(mapThreadSummary),
    [threadsQuery.data],
  );

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

  const startThread: StartThread = async () =>
    ({ ok: false, reason: "use_eve_bridge" }) as unknown as SendResult;

  const sendMessage: SendMessage = async () =>
    ({ ok: false, reason: "use_eve_bridge" }) as unknown as SendResult;

  return {
    isAuthenticated: active,
    viewer: profile.data
      ? {
          name: profile.data.name,
          email: profile.data.email,
          image: profile.data.image,
        }
      : undefined,
    workspaces: index.workspaces,
    threads,
    selectedThread,
    createWorkspace: index.createWorkspace,
    startThread,
    sendMessage,
    rateStatus: rateStatus.data
      ? ({
          ok: rateStatus.data.canSend,
          serverTime: 0,
          canSend: rateStatus.data.canSend,
          reason: rateStatus.data.reason,
          retryAt: rateStatus.data.retryAt,
        } as const)
      : undefined,
    runs: [] as ResearchRun[],
    artifacts: (artifactsQuery.data ?? []) as ResearchArtifact[],
    sources: (sourcesQuery.data ?? []) as unknown as ResearchSource[],
    cancelRun: async () => undefined,
    retryRun: async () => undefined,
    removeThread: async (args: { threadId: string }) => {
      await removeThreadMutation.mutateAsync({ id: args.threadId });
      return { ok: true as const };
    },
  };
}
