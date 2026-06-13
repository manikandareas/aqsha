"use client";

import { uiRunFromRow, type AgentRunRow } from "@aqsha/agent-contracts";
import { api } from "@aqsha/convex/api";
import { getPromptCommand } from "@aqsha/convex/prompt-commands";
import {
  useConvexAuth,
  useConvexMutationFn,
  useConvexQueryData,
} from "@/lib/convex-query";
import type { WorkspaceId } from "@/lib/convex-refs";
import type {
  SendMessage,
  StartThread,
} from "../components/component-types";
import type {
  ResearchArtifact,
  ResearchRun,
  ResearchSource,
  SendResult,
} from "../types";

// The canonical thread-experience data hook: it reads/writes the first-party
// agent tables written by the apps/agents SDK service (api.agent.*).
//
// Remaining gap (plan §9.3): the per-thread sources panel stays empty until
// deep research runs durably on this backend (Step 4).

/**
 * The composer keeps sending the legacy {content, commandId} pair; the SDK
 * backend wants the slash command inline in the prompt (plan §5.4). Deep
 * research maps to the service-intercepted /deep.
 */
export function promptForSdkBackend(content: string, commandId?: string): string {
  if (!commandId) {
    return content;
  }
  const command = getPromptCommand(commandId);
  if (!command) {
    return content;
  }
  const slug = command.mode === "deep" ? "/deep" : command.slug;
  return `${slug} ${content}`.trim();
}

export function useThreadExperienceData(threadId: string | undefined, enabled = true) {
  const { isAuthenticated } = useConvexAuth();
  const active = enabled && isAuthenticated;
  const viewer = useConvexQueryData(api.auth.getCurrentUser, active ? {} : "skip");
  const threads = useConvexQueryData(
    api.agent.queries.listThreads,
    active ? {} : "skip",
  );
  const workspacePage = useConvexQueryData(
    api.workspaces.list,
    active ? { paginationOpts: { cursor: null, numItems: 50 } } : "skip",
  );
  const selectedThreadRaw = useConvexQueryData(
    api.agent.queries.getThread,
    active && threadId ? { threadId } : "skip",
  );
  // The backend stores workspace ids as plain strings; downstream panels expect
  // the branded Id<"workspaces"> this hook returns.
  const selectedThread =
    selectedThreadRaw === undefined
      ? undefined
      : selectedThreadRaw === null
        ? null
        : {
            ...selectedThreadRaw,
            workspaceId: selectedThreadRaw.workspaceId as WorkspaceId | undefined,
          };
  const threadQueriesEnabled = Boolean(active && threadId && selectedThread !== null);
  const rateStatus = useConvexQueryData(
    api.agent.rateLimits.getSendStatus,
    active ? {} : "skip",
  );
  const runRows = useConvexQueryData(
    api.agent.queries.listRuns,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  );
  const artifactRows = useConvexQueryData(
    api.agent.queries.listArtifacts,
    threadQueriesEnabled ? { threadId: threadId! } : "skip",
  );

  const createWorkspace = useConvexMutationFn(api.workspaces.create);
  const startThreadMutation = useConvexMutationFn(api.agent.startThread);
  const sendMessageMutation = useConvexMutationFn(api.agent.sendMessage);
  const cancelRunMutation = useConvexMutationFn(api.agent.cancelRun);
  const retryRunMutation = useConvexMutationFn(api.agent.retryRun);
  const removeThreadMutation = useConvexMutationFn(api.agent.removeThread);

  // Typed against the shared StartThread/SendMessage contracts so this hook IS
  // the canonical thread-experience surface. Fields the backend doesn't use
  // (pendingAttachments) are accepted and ignored — pinned context rides
  // contextArtifactIds.
  const startThread: StartThread = async (args) => {
    return (await startThreadMutation({
      content: promptForSdkBackend(args.content, args.commandId),
      agentKind: args.agentKind,
      workspaceId: args.workspaceId as never,
      contextArtifactIds: [
        ...(args.selectedContextArtifactIds ?? []),
        ...(args.messageAttachmentArtifactIds ?? []),
      ],
      contextWorkspaceIds: args.selectedContextWorkspaceIds ?? [],
    })) as SendResult;
  };

  const sendMessage: SendMessage = async (args) => {
    return (await sendMessageMutation({
      threadId: args.threadId,
      content: promptForSdkBackend(args.content, args.commandId),
      contextArtifactIds: [
        ...(args.selectedContextArtifactIds ?? []),
        ...(args.messageAttachmentArtifactIds ?? []),
      ],
      contextWorkspaceIds: args.selectedContextWorkspaceIds ?? [],
    })) as SendResult;
  };

  const cancelRun = async (runId: string) => {
    try {
      return await cancelRunMutation({ runId });
    } catch (error) {
      console.error("Failed to cancel run", error);
    }
  };

  const runs = ((runRows ?? []) as AgentRunRow[]).map(
    (row) => uiRunFromRow(row) as unknown as ResearchRun,
  );

  return {
    isAuthenticated,
    viewer,
    workspaces: workspacePage?.page ?? [],
    threads: threads ?? [],
    selectedThread,
    createWorkspace,
    startThread,
    sendMessage,
    rateStatus,
    runs,
    artifacts: (artifactRows ?? []) as ResearchArtifact[],
    // Per-thread sources stay empty until deep research lands on this backend
    // (plan §9.4 Step 4).
    sources: [] as ResearchSource[],
    cancelRun,
    retryRun: async (args: { runId: string }) => {
      try {
        return await retryRunMutation({ runId: args.runId });
      } catch (error) {
        console.error("Failed to retry run", error);
      }
    },
    removeThread: removeThreadMutation,
  };
}
