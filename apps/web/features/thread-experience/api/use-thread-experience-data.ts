"use client";

import { api } from "@aqsha/convex/api";
import { toAgentRunId } from "@/lib/convex-refs";
import {
  useConvexAuth,
  useConvexMutationFn,
  useConvexOptimisticMutationState,
  useConvexQueryData,
} from "@/lib/convex-query";
import {
  optimisticallyInsertUserMessage,
  promptCommandMetadataForContent,
} from "./optimistic-updates";
import type { ResearchArtifact, ResearchRun, ResearchSource } from "../types";

export function useThreadExperienceData(threadId?: string) {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const threadPage = useConvexQueryData(
    api.agent.threads.list,
    isAuthenticated
      ? {
          paginationOpts: { cursor: null, numItems: 50 },
        }
      : "skip",
  );
  const workspacePage = useConvexQueryData(
    api.workspaces.list,
    isAuthenticated
      ? {
          paginationOpts: { cursor: null, numItems: 50 },
        }
      : "skip",
  );
  const selectedThread = useConvexQueryData(
    api.agent.threads.get,
    isAuthenticated && threadId ? { threadId } : "skip",
  );
  const threadQueriesEnabled = Boolean(isAuthenticated && threadId && selectedThread !== null);
  const shouldLoadGlobalContextCandidates = Boolean(
    isAuthenticated && (!threadId || (threadQueriesEnabled && !selectedThread?.workspaceId)),
  );
  const selectedContextArtifacts = useConvexQueryData(
    api.agent.threadContext.listForThread,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  );
  const contextCandidateArtifacts = useConvexQueryData(
    api.artifacts.listForContextPicker,
    shouldLoadGlobalContextCandidates ? { workspaceId: undefined } : "skip",
  );
  const createWorkspace = useConvexMutationFn(api.workspaces.create);
  const startThread = useConvexMutationFn(api.agent.messages.startThread);
  const sendMessage = useConvexOptimisticMutationState(
    api.agent.messages.send,
    (store, args) => {
      optimisticallyInsertUserMessage(store, {
        threadId: args.threadId,
        text: args.content,
        promptCommand: promptCommandMetadataForContent(args),
        contextArtifacts: args.contextArtifactSnapshot,
      });
    },
  );
  const rateStatus = useConvexQueryData(
    api.agent.rateLimits.getSendStatus,
    isAuthenticated ? {} : "skip",
  );
  const runs = useConvexQueryData(
    api.agent.deepResearch.listForThread,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  ) as ResearchRun[] | undefined;
  const artifacts = useConvexQueryData(
    api.agent.artifacts.list,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  ) as ResearchArtifact[] | undefined;
  const sources = useConvexQueryData(
    api.agent.sources.listForThread,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  ) as ResearchSource[] | undefined;
  const cancelRunMutation = useConvexMutationFn(api.agent.deepResearch.cancel);
  const retryRun = useConvexMutationFn(api.agent.deepResearch.retry);
  const removeThread = useConvexMutationFn(api.agent.threads.remove);

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
    createWorkspace,
    startThread,
    sendMessage: sendMessage.mutateAsync,
    rateStatus,
    runs: runs ?? [],
    artifacts: artifacts ?? [],
    sources: sources ?? [],
    cancelRun,
    retryRun,
    removeThread,
  };
}
