"use client";

import { api } from "@aqsha/convex/api";
import { toAgentRunId } from "@/lib/convex-refs";
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
  const workspacePage = useQuery(
    api.workspaces.list,
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
  const threadQueriesEnabled = Boolean(isAuthenticated && threadId && selectedThread !== null);
  const selectedContextArtifacts = useQuery(
    api.agent.threadContext.listForThread,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  );
  const contextCandidateArtifacts = useQuery(
    api.artifacts.listForContextPicker,
    threadQueriesEnabled && !selectedThread?.workspaceId
      ? { workspaceId: undefined }
      : "skip",
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
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  ) as ResearchRun[] | undefined;
  const artifacts = useQuery(
    api.agent.artifacts.list,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  ) as ResearchArtifact[] | undefined;
  const sources = useQuery(
    api.agent.sources.listForThread,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  ) as ResearchSource[] | undefined;
  const cancelRunMutation = useMutation(api.agent.deepResearch.cancel);
  const retryRun = useMutation(api.agent.deepResearch.retry);
  const removeThread = useMutation(api.agent.threads.remove);

  const cancelRun = async (runId: string) => {
    try {
      return await cancelRunMutation({ runId: toAgentRunId(runId) });
    } catch (error) {
      console.error("Failed to cancel deep research run", error);
    }
  };

  return {
    isAuthenticated,
    viewer,
    workspaces: workspacePage?.page ?? [],
    threads: threadPage?.page ?? [],
    selectedThread,
    selectedContextArtifacts: selectedContextArtifacts ?? [],
    selectedContextArtifactsLoaded: selectedContextArtifacts !== undefined,
    contextCandidateArtifacts: contextCandidateArtifacts ?? [],
    startThread,
    sendMessage,
    rateStatus,
    runs: runs ?? [],
    artifacts: artifacts ?? [],
    sources: sources ?? [],
    cancelRun,
    retryRun,
    removeThread,
  };
}
