"use client";

import { api } from "@aqsha/convex/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  optimisticallyInsertUserMessage,
  promptCommandMetadataForContent,
} from "./optimistic-updates";
import type { ResearchArtifact, ResearchRun, ResearchSource } from "../types";

export function useThreadExperienceData(threadId?: string) {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated
      ? {
          paginationOpts: { cursor: null, numItems: 50 },
        }
      : "skip",
  );
  const selectedThread = useQuery(
    api.agent.threads.get,
    isAuthenticated && threadId ? { threadId } : "skip",
  );
  const startThread = useMutation(api.agent.messages.startThread);
  const sendMessage = useMutation(api.agent.messages.send).withOptimisticUpdate(
    (store, args) => {
      optimisticallyInsertUserMessage(store, {
        threadId: args.threadId,
        text: args.content,
        promptCommand: promptCommandMetadataForContent(args),
      });
    },
  );
  const rateStatus = useQuery(
    api.agent.rateLimits.getSendStatus,
    isAuthenticated ? {} : "skip",
  );
  const runs = useQuery(
    api.agent.deepResearch.listForThread,
    isAuthenticated && threadId ? { threadId } : "skip",
  ) as ResearchRun[] | undefined;
  const artifacts = useQuery(
    api.agent.artifacts.list,
    isAuthenticated && threadId ? { threadId } : "skip",
  ) as ResearchArtifact[] | undefined;
  const sources = useQuery(
    api.agent.sources.listForThread,
    isAuthenticated && threadId ? { threadId } : "skip",
  ) as ResearchSource[] | undefined;
  const cancelRun = useMutation(api.agent.deepResearch.cancel);
  const retryRun = useMutation(api.agent.deepResearch.retry);

  return {
    isAuthenticated,
    viewer,
    threads: threadPage?.page ?? [],
    selectedThread,
    startThread,
    sendMessage,
    rateStatus,
    runs: runs ?? [],
    artifacts: artifacts ?? [],
    sources: sources ?? [],
    cancelRun,
    retryRun,
  };
}

export function useActiveArtifact(artifactId: string | null) {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(
    api.agent.artifacts.get,
    isAuthenticated && artifactId ? { artifactId: artifactId as never } : "skip",
  ) as ResearchArtifact | null | undefined;
}
