import {
  createThread,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { generateObject } from "ai";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  agentForKind,
  astra,
  usageHandlerForAgent,
  type AgentKind,
} from "./runtime";
import {
  CHAT_LITE_MODEL,
  CHAT_PRO_MODEL,
  chatModelForAgent,
  deepModelForAgent,
} from "./models";
import { requireCurrentUser } from "../auth";
import { estimateCredits, featureForUsage } from "../billing/catalog";
import {
  consumeCredits,
  recordProviderUsage,
  type EntitlementResult,
} from "../billing/entitlements";
import { rateLimiter } from "../limits";
import {
  buildNormalChatTools,
  createCitationCounter,
  type CitationCounter,
  NORMAL_CHAT_TOOL_NAMES,
} from "./research/researchTools";
import { isDeepResearchStartedResult } from "./research/deepResearchContract";
import { buildHitlTools, buildDeepResearchTools } from "./hitl/hitlTools";
import { routeCompute } from "./sandbox/computeRouter";
import { buildSandboxTools, SANDBOX_TOOL_NAMES } from "./sandbox/sandboxTools";
import { buildCitationTools, CITATION_TOOL_NAMES } from "./research/citationTools";
import { detectCitationVerifyIntent } from "./research/citationRouter";
import { buildResumeRagContextHandler } from "./context/resumeContext";
import { buildSkillTools, SKILL_TOOL_NAMES } from "./skills/skillTools";
import type { ToolSet } from "ai";
import type { SourceCandidate } from "./research/sourceCandidates";
import {
  DEFAULT_THREAD_TITLE,
  isUsableGeneratedThreadTitle,
  normalizeGeneratedThreadTitle,
  shouldUsePromptTitle,
  threadTitleFromPrompt,
} from "./threadTitles";
import {
  HITL_INITIAL_TOOL_NAMES,
  PENDING_HITL_TOOL_NAME_SET,
} from "./hitl/hitlToolNames";
import { assertThreadOwner, tryAssertThreadOwner } from "./threads";
import { throwAppError } from "../lib/appError";
import { resolvePromptPayload } from "./prompt/promptRouting";
import {
  promptExecutionKindForCommand,
  type PromptPayload,
} from "./prompt/promptPayload";
import { assertWorkspaceOwner } from "../workspaces/access";
import {
  addContextArtifactsForThread,
  buildPromptContextForThread,
  persistMessageContextArtifacts,
  persistMessageContextWorkspaces,
  prependPromptContext,
} from "./context/threadContext";
import { addContextWorkspacesForThread } from "./context/threadContextWorkspaces";
import { stripMentionMarkers } from "./context/mentionMarkers";
import { CHAT_PROVIDER_NAME, chatProvider } from "./providers/providers";
import { hasActiveReplyRun, hasOtherActiveReplyRun } from "./runLifecycle";

const MAX_CONTENT_LENGTH = 8_000;
const FAILURE_TEXT =
  "Astra belum bisa menjawab pesan ini. Coba kirim ulang sebentar lagi.";

const sendResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    threadId: v.optional(v.string()),
    messageId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    workflowId: v.optional(v.string()),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal("rate_limited"),
      v.literal("quota_exceeded"),
      v.literal("subscription_required"),
      v.literal("billing_inactive"),
      v.literal("reply_in_progress"),
    ),
    retryAt: v.optional(v.number()),
    resetAt: v.optional(v.number()),
    requiredPlan: v.optional(v.union(v.literal("free"), v.literal("starter"), v.literal("plus"))),
    creditsRemaining: v.optional(v.number()),
  }),
);

type SendResult =
  | {
      ok: true;
      threadId?: string;
      messageId: string;
      runId?: import("../_generated/dataModel").Id<"agentRuns">;
      workflowId?: string;
    }
  | {
      ok: false;
      reason:
        | "rate_limited"
        | "quota_exceeded"
        | "subscription_required"
        | "billing_inactive"
        | "reply_in_progress";
      retryAt?: number;
      resetAt?: number;
      requiredPlan?: "free" | "starter" | "plus";
      creditsRemaining?: number;
    };

function previewFromContent(content: string) {
  const singleLine = stripMentionMarkers(content).replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function trimForTitleContext(content: string) {
  const singleLine = stripMentionMarkers(content).replace(/\s+/g, " ").trim();
  return singleLine.length > 1_500
    ? `${singleLine.slice(0, 1_497).trimEnd()}...`
    : singleLine;
}

function estimateTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

async function getThreadMetadata(ctx: QueryCtx | MutationCtx, threadId: string) {
  return await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
}

async function upsertThreadMetadata(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    preview?: string;
    status: "idle" | "streaming" | "failed";
    incrementMessageCount?: boolean;
    workspaceId?: Id<"workspaces">;
    lastAgentKind?: AgentKind;
  },
) {
  const now = Date.now();
  const existing = await getThreadMetadata(ctx, args.threadId);
  if (existing) {
    await ctx.db.patch("threadMetadata", existing._id, {
      lastActivityAt: now,
      ...(args.preview !== undefined ? { lastMessagePreview: args.preview } : {}),
      messageCount: existing.messageCount + (args.incrementMessageCount ? 1 : 0),
      status: args.status,
      workspaceId: existing.workspaceId ?? args.workspaceId,
      ...(args.lastAgentKind !== undefined ? { lastAgentKind: args.lastAgentKind } : {}),
    });
    return;
  }

  if (args.preview === undefined) {
    throwAppError({
      message: "Thread preview is required when creating metadata",
      code: "thread_metadata_preview_required",
      severity: "error",
    });
  }

  await ctx.db.insert("threadMetadata", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    workspaceId: args.workspaceId,
    lastActivityAt: now,
    lastMessagePreview: args.preview,
    messageCount: args.incrementMessageCount ? 1 : 0,
    status: args.status,
    ...(args.lastAgentKind !== undefined ? { lastAgentKind: args.lastAgentKind } : {}),
  });
}

async function updateThreadTitleFromPrompt(
  ctx: MutationCtx,
  args: {
    threadId: string;
    currentTitle?: string;
    prompt: string;
  },
) {
  if (!shouldUsePromptTitle(args.currentTitle)) {
    return;
  }

  await astra.updateThreadMetadata(ctx, {
    threadId: args.threadId,
    patch: { title: threadTitleFromPrompt(stripMentionMarkers(args.prompt)) },
  });
}

function validateContent(content: string) {
  const trimmed = content.trim();
  if (trimmed.length < 1) {
    throwAppError({
      message: "Message cannot be empty",
      code: "message_empty",
      field: "content",
      severity: "warning",
    });
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    throwAppError({
      message: "Message is too long",
      code: "message_too_long",
      field: "content",
      severity: "warning",
    });
  }
  return trimmed;
}

function sendBillingFailure(entitlement: Extract<EntitlementResult, { ok: false }>): SendResult {
  return {
    ok: false,
    reason: entitlement.reason,
    resetAt: entitlement.resetAt,
    requiredPlan: entitlement.requiredPlan,
    creditsRemaining: entitlement.creditsRemaining,
  };
}

async function checkAndConsumeSendQuota(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    ownerEmail?: string | null;
    content: string;
    agentKind: AgentKind;
    isDeep: boolean;
  },
): Promise<
  | { ok: true }
  | { ok: false; retryAt?: number; entitlement?: Extract<EntitlementResult, { ok: false }> }
> {
  const estimatedTokens = estimateTokens(args.content);
  // Deep runs go through the deep_research feature (governed by the monthly
  // deepResearchRuns quota). Lite-deep is allowed on Free (requiredPlan "free");
  // Pro-deep and Pro chat require a paid plan.
  const feature = args.isDeep
    ? "deep_research"
    : args.agentKind === "pro"
      ? "pro_chat"
      : "normal_chat";
  const model = args.isDeep
    ? deepModelForAgent(args.agentKind)
    : chatModelForAgent(args.agentKind);
  const requiredPlan = args.isDeep
    ? args.agentKind === "pro"
      ? ("starter" as const)
      : ("free" as const)
    : args.agentKind === "pro"
      ? ("starter" as const)
      : ("free" as const);
  const entitlement = await consumeCredits(ctx, {
    ownerUserId: args.ownerUserId,
    ownerEmail: args.ownerEmail,
    feature,
    provider: CHAT_PROVIDER_NAME,
    model,
    inputTokens: estimatedTokens,
    totalTokens: estimatedTokens,
    credits: estimateCredits({
      feature,
      inputTokens: estimatedTokens,
      totalTokens: estimatedTokens,
      agentKind: args.agentKind,
    }),
    requiredPlan,
  });
  if (!entitlement.ok) {
    return { ok: false, entitlement };
  }
  const rateChecks = await Promise.all([
    rateLimiter.check(ctx, "sendMessage", { key: args.ownerUserId }),
    rateLimiter.check(ctx, "globalSendMessage"),
    rateLimiter.check(ctx, "globalTokenUsage", { count: estimatedTokens }),
  ]);
  const blocked = rateChecks.find((status) => !status.ok);
  if (blocked && !blocked.ok) {
    return {
      ok: false,
      retryAt: Date.now() + blocked.retryAfter,
    };
  }
  await Promise.all([
    rateLimiter.limit(ctx, "sendMessage", { key: args.ownerUserId }),
    rateLimiter.limit(ctx, "globalSendMessage"),
  ]);
  return { ok: true };
}

async function savePromptAndScheduleRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    threadTitle?: string;
    content: string;
    agentKind: AgentKind;
    commandId?: string;
    workspaceId?: Id<"workspaces">;
    selectedContextArtifactIds?: Id<"artifacts">[];
    selectedContextWorkspaceIds?: Id<"workspaces">[];
    messageAttachmentArtifactIds?: Id<"artifacts">[];
    contextArtifactSnapshot?: Array<{
      artifactId: Id<"artifacts">;
      title: string;
      artifactType?: string;
      source?: "upload" | "workspace";
    }>;
    deferGeneration?: boolean;
  },
): Promise<SendResult> {
  if (args.selectedContextArtifactIds && args.selectedContextArtifactIds.length > 0) {
    await addContextArtifactsForThread(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactIds: args.selectedContextArtifactIds,
    });
  }
  if (args.selectedContextWorkspaceIds && args.selectedContextWorkspaceIds.length > 0) {
    await addContextWorkspacesForThread(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      workspaceIds: args.selectedContextWorkspaceIds,
    });
  }

  // The composer sends the message WITH inline mention markers. Keep the agent
  // message clean, and stash the marked text separately for the bubble renderer.
  const markedContent = args.content;
  const cleanContent = stripMentionMarkers(markedContent);
  const promptPayload = await resolvePromptPayload(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    content: cleanContent,
    commandId: args.commandId,
  });

  const saved = await astra.saveMessages(ctx, {
    threadId: args.threadId,
    userId: args.ownerUserId,
    messages: [{ role: "user", content: promptPayload.visibleContent }],
    skipEmbeddings: true,
  });
  const messageId = saved.messages[0]._id;
  const preview = previewFromContent(promptPayload.visibleContent);

  if (markedContent !== cleanContent) {
    await ctx.db.insert("messageRichContent", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId,
      content: markedContent,
      createdAt: Date.now(),
    });
  }

  if (promptPayload.commandMetadata) {
    await ctx.db.insert("messageCommands", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId,
      ...promptPayload.commandMetadata,
      agentKind: args.agentKind,
      createdAt: Date.now(),
    });
  }

  await persistMessageContextArtifacts(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    messageId,
    snapshot: args.contextArtifactSnapshot,
  });
  await persistMessageContextWorkspaces(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    messageId,
  });

  await upsertThreadMetadata(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    preview,
    status: args.deferGeneration ? "idle" : "streaming",
    incrementMessageCount: true,
    workspaceId: args.workspaceId,
    lastAgentKind: args.agentKind,
  });

  await updateThreadTitleFromPrompt(ctx, {
    threadId: args.threadId,
    currentTitle: args.threadTitle,
    prompt: promptPayload.visibleContent,
  });

  if (args.deferGeneration) {
    return { ok: true as const, messageId };
  }

  return await scheduleGenerationForMessage(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    messageId,
    agentKind: args.agentKind,
    promptPayload,
    messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
  });
}

async function scheduleGenerationForMessage(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    messageId: string;
    agentKind: AgentKind;
    promptPayload: PromptPayload;
    messageAttachmentArtifactIds?: Id<"artifacts">[];
  },
): Promise<SendResult> {
  const contextBlock = await buildPromptContextForThread(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
  });
  const generationPrompt = prependPromptContext({
    prompt: args.promptPayload.expandedPrompt,
    contextBlock,
  });

  const commandId = args.promptPayload.commandMetadata?.commandId;
  if (args.promptPayload.executionKind === "deep_research") {
    const run: {
      runId: import("../_generated/dataModel").Id<"agentRuns">;
    } = await ctx.runMutation(internal.agent.research.deepResearch.startForMessage, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.messageId,
      prompt: generationPrompt,
      commandId,
      agentKind: args.agentKind,
    });

    return { ok: true as const, messageId: args.messageId, ...run };
  }

  const runId = await ctx.runMutation(internal.agent.messages.startInlineRun, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    promptMessageId: args.messageId,
    prompt: generationPrompt,
    agentKind: args.agentKind,
    visiblePrompt: args.promptPayload.visibleContent,
    messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
  });
  await ctx.scheduler.runAfter(0, internal.agent.messages.generateReply, {
    threadId: args.threadId,
    userId: args.ownerUserId,
    promptMessageId: args.messageId,
    prompt: generationPrompt,
    visiblePrompt: args.promptPayload.visibleContent,
    runId,
    commandId,
    agentKind: args.agentKind,
    messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
  });

  return { ok: true as const, messageId: args.messageId, runId };
}

const contextArtifactSnapshotValidator = v.array(
  v.object({
    artifactId: v.id("artifacts"),
    title: v.string(),
    artifactType: v.optional(v.string()),
    source: v.optional(v.union(v.literal("upload"), v.literal("workspace"))),
  }),
);

const pendingAttachmentValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

export const completeThreadStartAfterAttachments = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    threadTitle: v.optional(v.string()),
    content: v.string(),
    agentKind: v.union(v.literal("lite"), v.literal("pro")),
    commandId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    selectedContextArtifactIds: v.optional(v.array(v.id("artifacts"))),
    selectedContextWorkspaceIds: v.optional(v.array(v.id("workspaces"))),
    contextArtifactSnapshot: v.optional(contextArtifactSnapshotValidator),
    messageAttachmentArtifactIds: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args) => {
    if (args.selectedContextArtifactIds && args.selectedContextArtifactIds.length > 0) {
      await addContextArtifactsForThread(ctx, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        artifactIds: args.selectedContextArtifactIds,
      });
    }
    if (args.selectedContextWorkspaceIds && args.selectedContextWorkspaceIds.length > 0) {
      await addContextWorkspacesForThread(ctx, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        workspaceIds: args.selectedContextWorkspaceIds,
      });
    }

    // persistMessageContextArtifacts / persistMessageContextWorkspaces are
    // idempotent by messageId (they clear prior rows first), so this two-phase
    // completion path can re-run without duplicating context rows.
    await persistMessageContextArtifacts(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      snapshot: args.contextArtifactSnapshot,
    });
    await persistMessageContextWorkspaces(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
    });

    await upsertThreadMetadata(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      status: "streaming",
      workspaceId: args.workspaceId,
    });

    const promptPayload = await resolvePromptPayload(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      content: args.content,
      commandId: args.commandId,
    });

    await scheduleGenerationForMessage(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      agentKind: args.agentKind,
      promptPayload,
      messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
    });
  },
});

export const startThread = mutation({
  args: {
    content: v.string(),
    agentKind: v.union(v.literal("lite"), v.literal("pro")),
    commandId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    selectedContextArtifactIds: v.optional(v.array(v.id("artifacts"))),
    selectedContextWorkspaceIds: v.optional(v.array(v.id("workspaces"))),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    pendingAttachments: v.optional(v.array(pendingAttachmentValidator)),
    contextArtifactSnapshot: v.optional(contextArtifactSnapshotValidator),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const user = await requireCurrentUser(ctx);
    const content = validateContent(args.content);
    if (args.workspaceId) {
      await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    }
    // A brand-new thread is "filed under" the explicit workspace if provided,
    // else the first @mentioned workspace (decision: first @workspace from Home
    // auto-files the thread). Ownership of the mentioned workspace is validated
    // by replaceContextWorkspacesForThread.
    const filedWorkspaceId = args.workspaceId ?? args.selectedContextWorkspaceIds?.[0];
    const quota = await checkAndConsumeSendQuota(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      content,
      agentKind: args.agentKind,
      isDeep: promptExecutionKindForCommand(args.commandId) === "deep_research",
    });
    if (!quota.ok) {
      return quota.entitlement
        ? sendBillingFailure(quota.entitlement)
        : {
            ok: false as const,
            reason: "rate_limited" as const,
            retryAt: quota.retryAt,
          };
    }

    const threadId = await createThread(ctx, components.agent, {
      userId: user._id,
      title: threadTitleFromPrompt(content),
    });

    if (args.pendingAttachments && args.pendingAttachments.length > 0) {
      const deferred = await savePromptAndScheduleRun(ctx, {
        ownerUserId: user._id,
        threadId,
        threadTitle: threadTitleFromPrompt(content),
        content,
        agentKind: args.agentKind,
        commandId: args.commandId,
        workspaceId: filedWorkspaceId,
        selectedContextArtifactIds: args.selectedContextArtifactIds,
        selectedContextWorkspaceIds: args.selectedContextWorkspaceIds,
        contextArtifactSnapshot: args.contextArtifactSnapshot,
        deferGeneration: true,
      });
      if (!deferred.ok) {
        return deferred;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.artifacts.uploads.processPendingAttachmentsAndStart,
        {
          ownerUserId: user._id,
          ownerEmail: user.email ?? undefined,
          threadId,
          messageId: deferred.messageId,
          threadTitle: threadTitleFromPrompt(content),
          content,
          agentKind: args.agentKind,
          commandId: args.commandId,
          workspaceId: filedWorkspaceId,
          pendingAttachments: args.pendingAttachments,
          selectedContextArtifactIds: args.selectedContextArtifactIds,
          selectedContextWorkspaceIds: args.selectedContextWorkspaceIds,
          contextArtifactSnapshot: args.contextArtifactSnapshot,
        },
      );
      return { ...deferred, threadId };
    }

    const result = await savePromptAndScheduleRun(ctx, {
      ownerUserId: user._id,
      threadId,
      threadTitle: threadTitleFromPrompt(content),
      content,
      agentKind: args.agentKind,
      commandId: args.commandId,
      workspaceId: filedWorkspaceId,
      selectedContextArtifactIds: args.selectedContextArtifactIds,
      selectedContextWorkspaceIds: args.selectedContextWorkspaceIds,
      messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
      contextArtifactSnapshot: args.contextArtifactSnapshot,
    });

    return result.ok ? { ...result, threadId } : result;
  },
});

export const send = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
    agentKind: v.union(v.literal("lite"), v.literal("pro")),
    commandId: v.optional(v.string()),
    selectedContextArtifactIds: v.optional(v.array(v.id("artifacts"))),
    selectedContextWorkspaceIds: v.optional(v.array(v.id("workspaces"))),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    contextArtifactSnapshot: v.optional(contextArtifactSnapshotValidator),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const user = await requireCurrentUser(ctx);
    const content = validateContent(args.content);
    const thread = await assertThreadOwner(ctx, args.threadId);
    if (await hasActiveReplyRun(ctx, { ownerUserId: user._id, threadId: args.threadId })) {
      return { ok: false as const, reason: "reply_in_progress" as const };
    }
    const quota = await checkAndConsumeSendQuota(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      content,
      agentKind: args.agentKind,
      isDeep: promptExecutionKindForCommand(args.commandId) === "deep_research",
    });
    if (!quota.ok) {
      return quota.entitlement
        ? sendBillingFailure(quota.entitlement)
        : {
            ok: false as const,
            reason: "rate_limited" as const,
            retryAt: quota.retryAt,
          };
    }
    return await savePromptAndScheduleRun(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
      threadTitle: thread.title,
      content,
      agentKind: args.agentKind,
      commandId: args.commandId,
      selectedContextArtifactIds: args.selectedContextArtifactIds,
      selectedContextWorkspaceIds: args.selectedContextWorkspaceIds,
      messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
      contextArtifactSnapshot: args.contextArtifactSnapshot,
    });
  },
});

export const list = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (!(await tryAssertThreadOwner(ctx, args.threadId))) {
      const streams = await syncStreams(ctx, components.agent, args);
      return {
        page: [],
        isDone: true,
        continueCursor: args.paginationOpts.cursor ?? "",
        streams,
      };
    }
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    const messageIds = paginated.page
      .map((message) => message.id)
      .filter((id): id is string => typeof id === "string");
    const commandRows = await Promise.all(
      messageIds.map((messageId) =>
        ctx.db
          .query("messageCommands")
          .withIndex("by_owner_message", (q) =>
            q.eq("ownerUserId", user._id).eq("messageId", messageId),
          )
          .unique(),
      ),
    );
    const contextRows = await Promise.all(
      messageIds.map((messageId) =>
        ctx.db
          .query("messageContextArtifacts")
          .withIndex("by_owner_message", (q) =>
            q.eq("ownerUserId", user._id).eq("messageId", messageId),
          )
          .collect(),
      ),
    );
    const workspaceContextRows = await Promise.all(
      messageIds.map((messageId) =>
        ctx.db
          .query("messageContextWorkspaces")
          .withIndex("by_owner_message", (q) =>
            q.eq("ownerUserId", user._id).eq("messageId", messageId),
          )
          .collect(),
      ),
    );
    const richContentRows = await Promise.all(
      messageIds.map((messageId) =>
        ctx.db
          .query("messageRichContent")
          .withIndex("by_owner_message", (q) =>
            q.eq("ownerUserId", user._id).eq("messageId", messageId),
          )
          .unique(),
      ),
    );
    const richContentByMessageId = new Map<string, string>();
    for (const row of richContentRows) {
      if (row && row.threadId === args.threadId) {
        richContentByMessageId.set(row.messageId, row.content);
      }
    }
    const byMessageId = new Map();
    for (const row of commandRows) {
      if (!row || row.threadId !== args.threadId) {
        continue;
      }
      byMessageId.set(row.messageId, {
        commandId: row.commandId,
        commandLabel: row.commandLabel,
        commandSlug: row.commandSlug,
        mode: row.mode,
        agentKind: row.agentKind,
        argumentPreview: row.argumentPreview,
      });
    }
    const contextByMessageId = new Map<string, Array<{
      artifactId: string;
      title: string;
      artifactType?: string;
      source?: "upload" | "workspace";
      savedWorkspaceId?: string;
      savedWorkspaceName?: string;
    }>>();
    const artifactIds = new Set<Id<"artifacts">>();
    for (const rows of contextRows) {
      for (const row of rows) {
        if (row.threadId !== args.threadId) {
          continue;
        }
        artifactIds.add(row.artifactId);
      }
    }
    const artifactWorkspaceById = new Map<string, Id<"workspaces">>();
    for (const artifactId of artifactIds) {
      const artifact = await ctx.db.get("artifacts", artifactId);
      if (artifact?.workspaceId) {
        artifactWorkspaceById.set(String(artifactId), artifact.workspaceId);
      }
    }
    const workspaceNameById = new Map<string, string>();
    for (const workspaceId of new Set(artifactWorkspaceById.values())) {
      const workspace = await ctx.db.get("workspaces", workspaceId);
      if (workspace) {
        workspaceNameById.set(String(workspaceId), workspace.name);
      }
    }
    for (const rows of contextRows) {
      for (const row of rows) {
        if (row.threadId !== args.threadId) {
          continue;
        }
        const savedWorkspaceId = artifactWorkspaceById.get(String(row.artifactId));
        const existing = contextByMessageId.get(row.messageId) ?? [];
        existing.push({
          artifactId: row.artifactId,
          title: row.title,
          artifactType: row.artifactType,
          source: row.source,
          ...(savedWorkspaceId
            ? {
                savedWorkspaceId: String(savedWorkspaceId),
                savedWorkspaceName:
                  workspaceNameById.get(String(savedWorkspaceId)) ?? "Workspace",
              }
            : {}),
        });
        contextByMessageId.set(row.messageId, existing);
      }
    }
    const workspaceContextByMessageId = new Map<
      string,
      Array<{ workspaceId: string; name: string }>
    >();
    for (const rows of workspaceContextRows) {
      for (const row of rows) {
        if (row.threadId !== args.threadId) {
          continue;
        }
        const existing = workspaceContextByMessageId.get(row.messageId) ?? [];
        existing.push({ workspaceId: String(row.workspaceId), name: row.name });
        workspaceContextByMessageId.set(row.messageId, existing);
      }
    }
    return {
      ...paginated,
      page: paginated.page.map((message) => {
        const promptCommand = byMessageId.get(message.id);
        const contextArtifacts = contextByMessageId.get(message.id);
        const contextWorkspaces = workspaceContextByMessageId.get(message.id);
        const richContent = richContentByMessageId.get(message.id);
        if (
          !promptCommand &&
          !contextArtifacts?.length &&
          !contextWorkspaces?.length &&
          !richContent
        ) {
          return message;
        }
        const existingMetadata = (message as { metadata?: unknown }).metadata;
        return {
          ...message,
          metadata: {
            ...(typeof existingMetadata === "object" && existingMetadata !== null
              ? existingMetadata
              : {}),
            ...(promptCommand ? { promptCommand } : {}),
            ...(contextArtifacts?.length ? { contextArtifacts } : {}),
            ...(contextWorkspaces?.length ? { contextWorkspaces } : {}),
            ...(richContent ? { richContent } : {}),
          },
        };
      }),
      streams,
    };
  },
});

// HITL tool-name sets live in agent/hitl/hitlToolNames.ts (the single source of
// truth shared with the web client). `HITL_INITIAL_TOOL_NAMES` is the initial-turn
// surface (executeArtifact withheld until an approved proposeArtifact);
// `PENDING_HITL_TOOL_NAME_SET` is every tool that can hold a turn pending approval.

// A native HITL pause is an unsatisfied HITL tool call in this generation:
// `askUser` (no execute) or a `needsApproval` action tool awaiting approval —
// i.e. a tool call with no matching tool result.
function hasPendingNativeHitl(
  steps: Array<{
    toolCalls?: Array<{ toolName?: string; toolCallId?: string }>;
    toolResults?: Array<{ toolCallId?: string }>;
  }>,
): boolean {
  const resolved = new Set<string>();
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (result.toolCallId) resolved.add(result.toolCallId);
    }
  }
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (
        call.toolCallId &&
        PENDING_HITL_TOOL_NAME_SET.has(call.toolName ?? "") &&
        !resolved.has(call.toolCallId)
      ) {
        return true;
      }
    }
  }
  return false;
}

// Count artifact create/update/delete side effects performed by native HITL
// tools (status-shaped results) so the run's artifactCount stays meaningful.
function countNativeArtifactMutations(
  steps: Array<{ toolResults?: Array<{ output?: unknown }> }>,
): number {
  let count = 0;
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      const output = result.output as { status?: string } | undefined;
      if (output?.status === "executed" || output?.status === "deleted") {
        count += 1;
      }
    }
  }
  return count;
}

function buildGenerationTools(
  promptMessageId: string,
  counter: CitationCounter,
  runId: Id<"agentRuns"> | undefined,
  skillCatalogNames: string[],
): ToolSet {
  // Sandbox tools are always in the toolset so the approval-gated runComputation
  // can execute on the resume turn; their visibility is gated per-turn via
  // activeTools (the compute router), so their schemas are only sent to the
  // model when relevant (zero token waste otherwise).
  return {
    ...buildNormalChatTools(counter),
    ...buildHitlTools({ promptMessageId }),
    ...buildSandboxTools({ runId }),
    ...buildCitationTools(),
    ...buildSkillTools({ catalogNames: skillCatalogNames, runId }),
  };
}

// Shared generation core for the initial turn (generateReply) and HITL resume
// (resumeGeneration). On the initial turn executeArtifact is withheld via
// activeTools; on resume the full HITL tool set is available so the model can
// run an approved proposeArtifact and then call executeArtifact.
async function runInlineGeneration(
  ctx: ActionCtx,
  args: {
    threadId: string;
    userId: string;
    promptMessageId: string;
    runId?: Id<"agentRuns">;
    agentKind: AgentKind;
    prompt?: string;
    visiblePrompt?: string;
    includeExecuteArtifact: boolean;
    messageAttachmentArtifactIds?: Id<"artifacts">[];
    scheduleTitle: boolean;
    deep?: boolean;
    // AUD-08: pre-built RAG block to re-inject on a HITL resume turn (no string
    // prompt is passed on resume, so it goes via contextHandler, not the prompt).
    resumeRagContext?: string;
  },
) {
  try {
    let prompt = args.prompt;
    if (prompt && args.visiblePrompt) {
      const ragContext = await ctx.runAction(
        internal.agent.context.ragContext.buildRagContextForThread,
        {
          ownerUserId: args.userId,
          threadId: args.threadId,
          query: args.visiblePrompt,
          messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
        },
      );
      prompt = ragContext ? [ragContext, "", prompt].join("\n") : prompt;
    }
    // Tier-1 skill catalog (names) for the per-turn activate_skill enum. Chat
    // turns only — deep research delegates skills per-subagent (Phase 3).
    const skillCatalogNames = args.deep
      ? []
      : (
          await ctx.runQuery(internal.agent.skills.skills.listCatalog, {
            ownerUserId: args.userId,
          })
        ).map((skill) => skill.name);
    const tools =
      args.deep && args.runId
        ? buildDeepResearchTools({
            promptMessageId: args.promptMessageId,
            runId: args.runId,
          })
        : // One citation counter per turn so [n] markers stay unique across every
          // research-tool call (AUD-05).
          buildGenerationTools(
            args.promptMessageId,
            createCitationCounter(1),
            args.runId,
            skillCatalogNames,
          );
    let activeTools = args.deep
      ? ["startDeepResearch"]
      : args.includeExecuteArtifact
        ? undefined
        : [...NORMAL_CHAT_TOOL_NAMES, ...HITL_INITIAL_TOOL_NAMES];
    // Compute router (deterministic, non-LLM): the sandbox tools are always in
    // the toolset (so an approved runComputation can resume); on a non-deep
    // initial turn we make them VISIBLE only when the prompt shows compute intent
    // and the agent is Pro (Lite withholds — handled in routeCompute). No intent
    // → not added to activeTools → schemas not sent → zero token waste. On a
    // resume turn (activeTools undefined) the whole toolset is already active.
    if (!args.deep && activeTools) {
      const compute = routeCompute({
        prompt: args.visiblePrompt ?? args.prompt ?? "",
        agentKind: args.agentKind,
      });
      if (compute.exposeStatVerification) {
        activeTools = [...activeTools, ...SANDBOX_TOOL_NAMES];
      }
      // Citation verification is a free feature on BOTH tiers (unlike sandbox
      // compute), so it is gated on prompt intent alone, not agent kind.
      if (detectCitationVerifyIntent(args.visiblePrompt ?? args.prompt ?? "")) {
        activeTools = [...activeTools, ...CITATION_TOOL_NAMES];
      }
      // Skills: the tier-1 catalog is always in the prompt; expose the
      // activation + resource tools whenever there is a skill to name.
      if (skillCatalogNames.length > 0) {
        activeTools = [...activeTools, ...SKILL_TOOL_NAMES];
      }
    }
    const agent = agentForKind(args.agentKind);
    const result = await agent.streamText(
      ctx,
      { threadId: args.threadId, userId: args.userId },
      {
        promptMessageId: args.promptMessageId,
        tools,
        ...(prompt ? { prompt } : {}),
        ...(activeTools ? { activeTools } : {}),
      },
      {
        saveStreamDeltas: { chunking: "word", throttleMs: 100 },
        usageHandler: usageHandlerForAgent(args.agentKind),
        // AUD-08: on a HITL resume the RAG block is injected via contextHandler
        // (never via prompt, which would clobber the resolution message). No-op
        // when resumeRagContext is unset (the normal initial-turn path).
        ...(args.resumeRagContext
          ? { contextHandler: buildResumeRagContextHandler(args.resumeRagContext) }
          : {}),
      },
    );
    await result.consumeStream();
    const text = await result.text;
    const steps = await result.steps;
    if (args.deep) {
      // Deep research planning/resume: if the model started the research
      // workflow (approved startDeepResearch), the workflow now owns the run +
      // thread lifecycle. Otherwise this is a pause awaiting plan approval, or a
      // plain text reply — patch the run status and release the composer.
      const deepStarted = steps.some((step) =>
        (step.toolResults ?? []).some((result) => {
          const part = result as { toolName?: string; output?: unknown };
          return (
            part.toolName === "startDeepResearch" &&
            isDeepResearchStartedResult(part.output)
          );
        }),
      );
      if (!deepStarted) {
        const pending = hasPendingNativeHitl(steps);
        if (args.runId) {
          await ctx.runMutation(internal.agent.messages.patchRunStatus, {
            ownerUserId: args.userId,
            threadId: args.threadId,
            runId: args.runId,
            status: pending ? "waiting" : "completed",
          });
        }
        await ctx.runMutation(internal.agent.messages.markThreadIdle, {
          ownerUserId: args.userId,
          threadId: args.threadId,
          runId: args.runId,
          preview: previewFromContent(text),
          incrementMessageCount: true,
        });
      }
      return;
    }
    const sourceCandidates = collectSourceCandidates(steps);
    const pendingHitl = hasPendingNativeHitl(steps);
    const artifactCount = countNativeArtifactMutations(steps);
    const assistantMessageId = getVisibleAssistantMessageId(result.savedMessages);
    if (assistantMessageId) {
      await ctx.runMutation(internal.agent.research.sources.persistCited, {
        ownerUserId: args.userId,
        threadId: args.threadId,
        messageId: assistantMessageId,
        candidates: sourceCandidates,
        citedNumbers: extractCitationNumbers(text),
      });
    }
    if (args.runId) {
      await ctx.runMutation(internal.agent.messages.completeInlineRun, {
        ownerUserId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        sourceCount: sourceCandidates.length,
        artifactCount,
        observations: collectToolObservations(steps),
        keepWaiting: pendingHitl,
      });
    }
    await ctx.runMutation(internal.agent.messages.markThreadIdle, {
      ownerUserId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      preview: previewFromContent(text),
      incrementMessageCount: true,
    });
    if (args.scheduleTitle && args.visiblePrompt) {
      await ctx.scheduler.runAfter(0, internal.agent.messages.generateThreadTitle, {
        threadId: args.threadId,
        userId: args.userId,
        prompt: args.visiblePrompt,
        assistantText: text,
      });
    }
  } catch (error) {
    if (args.runId) {
      await ctx.runMutation(internal.agent.messages.failInlineRun, {
        ownerUserId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        errorMessage: readableError(error),
      });
    }
    await astra.saveMessages(ctx, {
      threadId: args.threadId,
      userId: args.userId,
      promptMessageId: args.promptMessageId,
      messages: [{ role: "assistant", content: FAILURE_TEXT }],
      failPendingSteps: true,
      skipEmbeddings: true,
    });
    await ctx.runMutation(internal.agent.messages.markThreadFailed, {
      ownerUserId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      preview: FAILURE_TEXT,
    });
    throw error;
  }
}

export const generateReply = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
    visiblePrompt: v.string(),
    runId: v.optional(v.id("agentRuns")),
    commandId: v.optional(v.string()),
    // Optional for legacy/in-flight scheduled jobs queued before this field
    // existed; defaults to "lite".
    agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread || thread.userId !== args.userId) {
      throwAppError({ message: "Thread not found", code: "thread_not_found" });
    }
    await runInlineGeneration(ctx, {
      threadId: args.threadId,
      userId: args.userId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      agentKind: args.agentKind ?? "lite",
      prompt: args.prompt,
      visiblePrompt: args.visiblePrompt,
      includeExecuteArtifact: false,
      messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
      scheduleTitle: true,
    });
  },
});

// Resume generation after a native HITL pause is resolved: the user answered an
// askUser question (tool-result saved) or approved/denied an action tool
// (tool-approval-response saved). `promptMessageId` points at that saved
// message so the model continues with the answer already in its context. The
// full HITL tool set is available (incl. executeArtifact) so an approved
// proposeArtifact can be followed by the actual write.
export const resumeGeneration = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
    // True when resuming a deep_research thread (the approved startDeepResearch
    // tool must run, and the run lifecycle is owned by the research workflow).
    deep: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread || thread.userId !== args.userId) {
      throwAppError({ message: "Thread not found", code: "thread_not_found" });
    }
    // AUD-08: rebuild the pinned-document RAG context for an inline (non-deep) HITL
    // resume from the recall query captured at run start, and re-inject it via
    // contextHandler (the resume turn has no string prompt to prepend to). Absent
    // snapshot (pre-R2 runs) → resume proceeds without RAG, the prior behavior.
    let resumeRagContext: string | undefined;
    if (!(args.deep ?? false) && args.runId) {
      const recall = await ctx.runQuery(internal.agent.messages.getRunRecallContext, {
        runId: args.runId,
        ownerUserId: args.userId,
      });
      if (recall?.visiblePrompt) {
        const block: string = await ctx.runAction(
          internal.agent.context.ragContext.buildRagContextForThread,
          {
            ownerUserId: args.userId,
            threadId: args.threadId,
            query: recall.visiblePrompt,
            messageAttachmentArtifactIds: recall.attachmentArtifactIds,
          },
        );
        resumeRagContext = block || undefined;
      }
    }
    await runInlineGeneration(ctx, {
      threadId: args.threadId,
      userId: args.userId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      agentKind: args.agentKind ?? "lite",
      includeExecuteArtifact: true,
      scheduleTitle: false,
      deep: args.deep ?? false,
      resumeRagContext,
    });
  },
});

// AUD-08: the recall query + pinned attachments captured at inline-run start, read
// back by resumeGeneration to rebuild the RAG document context on a HITL resume.
export const getRunRecallContext = internalQuery({
  args: { runId: v.id("agentRuns"), ownerUserId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      visiblePrompt: v.optional(v.string()),
      attachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId) return null;
    return {
      visiblePrompt: run.visiblePromptSnapshot,
      attachmentArtifactIds: run.attachmentArtifactIds,
    };
  },
});

// Inline planning generation for /deep-research: the model proposes the
// research plan by calling the startDeepResearch tool (needsApproval), which
// pauses for the user. The actual research runs only after approval.
export const generateDeepPlan = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
    runId: v.id("agentRuns"),
    agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread || thread.userId !== args.userId) {
      throwAppError({ message: "Thread not found", code: "thread_not_found" });
    }
    await runInlineGeneration(ctx, {
      threadId: args.threadId,
      userId: args.userId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      agentKind: args.agentKind ?? "pro",
      prompt: args.prompt,
      includeExecuteArtifact: false,
      scheduleTitle: false,
      deep: true,
    });
  },
});

// Minimal run status patch for deep research (whose runs use the workflow step
// model, not inline observations — so completeInlineRun must not be used here).
export const patchRunStatus = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    status: v.union(
      v.literal("running"),
      v.literal("waiting"),
      v.literal("completed"),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId || run.threadId !== args.threadId) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch("agentRuns", args.runId, {
      status: args.status,
      updatedAt: now,
      ...(args.status === "completed" ? { completedAt: now } : {}),
    });
  },
});

export const generateThreadTitle = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    prompt: v.string(),
    assistantText: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread || thread.userId !== args.userId) {
      throwAppError({ message: "Thread not found", code: "thread_not_found" });
    }

    const fallbackTitle = threadTitleFromPrompt(args.prompt);
    if (
      thread.title &&
      thread.title !== DEFAULT_THREAD_TITLE &&
      thread.title !== fallbackTitle
    ) {
      return null;
    }

    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      maxOutputTokens: 80,
      schema: z.object({
        title: z
          .string()
          .min(1)
          .max(80)
          .describe("Specific thread title in the user's language"),
      }),
      system: [
        "You generate short chat thread titles.",
        "Use the same language as the user prompt.",
        "Capture the user's actual research intent.",
        "Do not mention title generation, requests, prompts, threads, or internal instructions.",
        "Return only the structured title field.",
      ].join(" "),
      prompt: [
        "Create a concise, specific title for this conversation.",
        "",
        `User prompt:\n${trimForTitleContext(args.prompt)}`,
        "",
        `Assistant answer:\n${trimForTitleContext(args.assistantText)}`,
      ].join("\n"),
    });

    const generatedTitle = normalizeGeneratedThreadTitle(result.object.title);
    if (!isUsableGeneratedThreadTitle(generatedTitle)) {
      return null;
    }

    await astra.updateThreadMetadata(ctx, {
      threadId: args.threadId,
      patch: { title: generatedTitle },
    });

    return null;
  },
});

export const startInlineRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
    agentKind: v.union(v.literal("lite"), v.literal("pro")),
    // AUD-08: the user-visible recall query + pinned attachments, stashed so a
    // later HITL resume can rebuild RAG context (see resumeGeneration).
    visiblePrompt: v.optional(v.string()),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args): Promise<Id<"agentRuns">> => {
    const now = Date.now();
    return await ctx.db.insert("agentRuns", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      mode: "normal",
      agentKind: args.agentKind,
      executionKind: "inline",
      promptSnapshot: args.prompt,
      visiblePromptSnapshot: args.visiblePrompt,
      attachmentArtifactIds: args.messageAttachmentArtifactIds,
      status: "running",
      currentStep: "understand",
      artifactCount: 0,
      sourceCount: 0,
      citationCheckCount: 0,
      retryable: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const completeInlineRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    sourceCount: v.number(),
    artifactCount: v.number(),
    observations: v.array(
      v.object({
        stepKey: v.string(),
        label: v.string(),
        summary: v.string(),
        sourceCount: v.optional(v.number()),
        artifactCount: v.optional(v.number()),
        eventType: v.union(v.literal("search"), v.literal("artifact"), v.literal("tool")),
        eventTitle: v.string(),
        eventSummary: v.string(),
        metadataJson: v.optional(v.string()),
      }),
    ),
    keepWaiting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId || run.threadId !== args.threadId) {
      throwAppError({ message: "Run not found", code: "run_not_found" });
    }
    const now = Date.now();
    const observations =
      args.observations.length > 0 || (args.sourceCount === 0 && args.artifactCount === 0)
        ? args.observations
        : [
            {
              stepKey: args.sourceCount > 0 ? "searchWeb" : "artifact",
              label: args.sourceCount > 0 ? "Mencari sumber" : "Membuat artifact",
              summary:
                args.sourceCount > 0
                  ? `${args.sourceCount} sumber dipakai`
                  : `${args.artifactCount} artifact dibuat`,
              sourceCount: args.sourceCount || undefined,
              artifactCount: args.artifactCount || undefined,
              eventType: args.sourceCount > 0 ? ("search" as const) : ("artifact" as const),
              eventTitle: args.sourceCount > 0 ? "Sumber" : "Artifact",
              eventSummary:
                args.sourceCount > 0
                  ? `${args.sourceCount} kandidat sumber ditemukan`
                  : `${args.artifactCount} artifact diproses`,
            },
          ];
    for (const [index, observation] of observations.entries()) {
      await ctx.db.insert("agentRunSteps", {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        stepKey: observation.stepKey,
        label: observation.label,
        order: index,
        status: "completed",
        summary: observation.summary,
        sourceCount: observation.sourceCount,
        artifactCount: observation.artifactCount,
        startedAt: run.createdAt,
        completedAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("agentRunEvents", {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        stepKey: observation.stepKey,
        eventType: observation.eventType,
        title: observation.eventTitle,
        summary: observation.eventSummary,
        metadataJson: observation.metadataJson,
        createdAt: now + index,
      });
    }
    await ctx.db.patch("agentRuns", args.runId, {
      // AUD-16: a chat-turn pause here is an in-thread askUser/needsApproval HITL
      // (keepWaiting === pendingHitl), distinct from plan-approval "waiting".
      status: args.keepWaiting ? "waiting_hitl" : "completed",
      currentStep: observations.at(-1)?.stepKey ?? "finalize",
      sourceCount: args.sourceCount,
      artifactCount: args.artifactCount,
      retryable: false,
      completedAt: args.keepWaiting ? undefined : now,
      updatedAt: now,
    });
  },
});

export const failInlineRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId || run.threadId !== args.threadId) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch("agentRuns", args.runId, {
      status: "failed",
      failedStep: "reply",
      errorCode: "normal_reply_failed",
      errorMessage: args.errorMessage,
      retryable: false,
      completedAt: now,
      updatedAt: now,
    });
  },
});

function extractCitationNumbers(text: string) {
  const matches = text.matchAll(/\[(\d{1,3})\]/g);
  return [...new Set([...matches].map((match) => Number(match[1])))];
}

function collectSourceCandidates(
  steps: Array<{ toolResults?: Array<{ output?: unknown }> }>,
) {
  const candidates: SourceCandidate[] = [];
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (!Array.isArray(result.output)) {
        continue;
      }
      for (const item of result.output) {
        if (isSourceCandidate(item)) {
          candidates.push(item);
        }
      }
    }
  }
  return candidates;
}

function isSourceCandidate(value: unknown): value is SourceCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SourceCandidate>;
  return (
    typeof candidate.citationNumber === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.locator === "string" &&
    typeof candidate.snippet === "string"
  );
}

type ToolObservation = {
  stepKey: string;
  label: string;
  summary: string;
  sourceCount?: number;
  artifactCount?: number;
  eventType: "search" | "artifact" | "tool";
  eventTitle: string;
  eventSummary: string;
  metadataJson?: string;
};

function collectToolObservations(
  steps: Array<{
    toolCalls?: Array<{ toolName?: string; input?: unknown; args?: unknown }>;
    toolResults?: Array<{ toolName?: string; output?: unknown; result?: unknown }>;
  }>,
): ToolObservation[] {
  const observations: ToolObservation[] = [];
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      const output = result.output ?? result.result;
      const toolName = result.toolName ?? inferToolName(output);
      if (Array.isArray(output)) {
        const candidates = output.filter(isSourceCandidate);
        if (candidates.length > 0) {
          observations.push({
            stepKey: "searchWeb",
            label: "Mencari sumber",
            summary: `${candidates.length} sumber ditemukan lewat ${providerLabel(candidates)}`,
            sourceCount: candidates.length,
            eventType: "search",
            eventTitle: providerLabel(candidates),
            eventSummary: candidates
              .slice(0, 3)
              .map((candidate) => candidate.title)
              .join(" | "),
            metadataJson: JSON.stringify({
              toolName,
              providers: [...new Set(candidates.map((candidate) => candidate.provider ?? candidate.origin))],
              urls: candidates.map((candidate) => candidate.url ?? candidate.locator).slice(0, 5),
            }),
          });
        }
        continue;
      }
    }
  }
  return observations;
}

function inferToolName(output: unknown) {
  if (Array.isArray(output) && output.some(isSourceCandidate)) {
    return "searchWeb";
  }
  return "tool";
}

function providerLabel(candidates: SourceCandidate[]) {
  const providers = [
    ...new Set(candidates.map((candidate) => candidate.provider ?? candidate.origin)),
  ];
  return providers.length > 0 ? providers.join(", ") : "provider eksternal";
}

function getVisibleAssistantMessageId(
  savedMessages:
    | Array<{
        _id: string;
        order?: number;
        stepOrder?: number;
        tool?: boolean;
        message?: { role?: string };
        role?: string;
      }>
    | undefined,
) {
  if (!savedMessages?.length) {
    return undefined;
  }

  const sortedMessages = [...savedMessages].sort((a, b) => {
    const order = (a.order ?? 0) - (b.order ?? 0);
    return order || (a.stepOrder ?? 0) - (b.stepOrder ?? 0);
  });
  let currentGroup: typeof sortedMessages = [];
  let currentOrder: number | undefined;
  let visibleMessageId: string | undefined;

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      visibleMessageId = currentGroup[0]._id;
      currentGroup = [];
      currentOrder = undefined;
    }
  };

  for (const message of sortedMessages) {
    const role = message.message?.role ?? message.role;
    if (role === "user" || role === "system") {
      flushGroup();
      continue;
    }
    if (role !== "assistant" && role !== "tool") {
      continue;
    }

    if (currentOrder !== undefined && message.order !== currentOrder) {
      flushGroup();
    }
    currentOrder = message.order;
    currentGroup.push(message);

    if (role === "assistant" && !message.tool) {
      flushGroup();
    }
  }
  flushGroup();

  return visibleMessageId;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const markThreadIdle = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    preview: v.string(),
    incrementMessageCount: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (
      args.runId &&
      (await hasOtherActiveReplyRun(ctx, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
      }))
    ) {
      return;
    }
    await upsertThreadMetadata(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      preview: args.preview,
      status: "idle",
      incrementMessageCount: args.incrementMessageCount,
    });
  },
});

export const markThreadFailed = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    preview: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      args.runId &&
      (await hasOtherActiveReplyRun(ctx, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
      }))
    ) {
      return;
    }
    await upsertThreadMetadata(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      preview: args.preview,
      status: "failed",
    });
  },
});

export const saveAssistantMessage = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const saved = await astra.saveMessages(ctx, {
      threadId: args.threadId,
      userId: args.ownerUserId,
      promptMessageId: args.promptMessageId,
      messages: [{ role: "assistant", content: args.content }],
      skipEmbeddings: true,
    });
    await upsertThreadMetadata(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      preview: previewFromContent(args.content),
      status: "idle",
      incrementMessageCount: true,
    });
    return { messageId: getVisibleAssistantMessageId(saved.messages) };
  },
});

export const recordUsage = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    provider: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
  },
  handler: async (ctx, { agentKind, ...args }) => {
    // Observe-only: record global token throughput so the pre-send check can act
    // as a system-wide safety valve, but NEVER throw here. This mutation runs in
    // the usage handler AFTER the reply is already generated; throwing would crash
    // a completed reply. `throws: false` covers normal over-limit; the try/catch
    // covers the hard "count exceeds capacity" error the component raises when a
    // single turn's tokens exceed the bucket capacity.
    try {
      const globalStatus = await rateLimiter.limit(ctx, "globalTokenUsage", {
        count: args.totalTokens,
        throws: false,
      });
      if (!globalStatus.ok) {
        console.warn("globalTokenUsage soft limit reached", {
          totalTokens: args.totalTokens,
          retryAfter: globalStatus.retryAfter,
        });
      }
    } catch (error) {
      console.warn("globalTokenUsage recording skipped", {
        totalTokens: args.totalTokens,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Attribute billing to the run's agent tier (agentKind); fall back to the
    // model string only for legacy/in-flight runs without it (AUD-02).
    const feature = featureForUsage({
      agentKind,
      isProModel: args.model === CHAT_PRO_MODEL,
    });
    await ctx.db.insert("usageLedger", {
      ...args,
      model: args.model || CHAT_LITE_MODEL,
      createdAt: Date.now(),
    });
    await recordProviderUsage(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      feature,
      provider: args.provider,
      model: args.model || CHAT_LITE_MODEL,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      credits: estimateCredits({
        feature,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        totalTokens: args.totalTokens,
      }),
    });
  },
});
