import {
  createThread,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { astra, NORMAL_MODEL, recordUsage as handleUsage } from "./runtime";
import { requireCurrentUser } from "../auth";
import { estimateCredits } from "../billing/catalog";
import {
  consumeCredits,
  recordProviderUsage,
  type EntitlementResult,
} from "../billing/entitlements";
import { rateLimiter } from "../limits";
import { researchTools } from "./researchTools";
import type { SourceCandidate } from "./sourceCandidates";
import {
  isUsableGeneratedThreadTitle,
  normalizeGeneratedThreadTitle,
  shouldUsePromptTitle,
  threadTitleFromPrompt,
} from "./threadTitles";
import { assertThreadOwner, tryAssertThreadOwner } from "./threads";
import { buildPromptCommandPrompt, getPromptCommand } from "./promptCommands";
import { assertWorkspaceOwner } from "../workspaceAccess";
import {
  buildPromptContextForThread,
  prependPromptContext,
  replaceContextArtifactsForThread,
} from "./threadContext";

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
      reason: "rate_limited" | "quota_exceeded" | "subscription_required" | "billing_inactive";
      retryAt?: number;
      resetAt?: number;
      requiredPlan?: "free" | "starter" | "plus";
      creditsRemaining?: number;
    };

function previewFromContent(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function stripCommandSlug(content: string, command: NonNullable<ReturnType<typeof getPromptCommand>>) {
  const trimmed = content.trim();
  const slugs = [command.slug, ...command.aliases].sort((a, b) => b.length - a.length);
  for (const slug of slugs) {
    if (trimmed === slug) {
      return "";
    }
    if (trimmed.startsWith(`${slug} `) || trimmed.startsWith(`${slug}\n`)) {
      return trimmed.slice(slug.length).trim();
    }
  }
  return trimmed;
}

function promptPayloadFromCommand(args: {
  content: string;
  mode: "normal" | "deep";
  commandId?: string;
}) {
  if (!args.commandId) {
    return {
      visibleContent: args.content,
      expandedPrompt: args.content,
      mode: args.mode,
      commandMetadata: null,
    };
  }

  const command = getPromptCommand(args.commandId);
  if (!command) {
    throw new ConvexError("Unknown prompt command");
  }
  const argument = stripCommandSlug(args.content, command);
  const compiled = buildPromptCommandPrompt(command.id, argument);
  if (!compiled) {
    throw new ConvexError("Unknown prompt command");
  }
  const visibleContent = argument.length > 0 ? `${command.slug} ${argument}` : command.slug;
  return {
    visibleContent,
    expandedPrompt: compiled.expandedPrompt,
    mode: command.mode === "deep" ? "deep" as const : args.mode,
    commandMetadata: {
      commandId: command.id,
      commandLabel: command.label,
      commandSlug: command.slug,
      mode: command.mode,
      argumentPreview: previewFromContent(argument),
      expandedPromptSnapshot: compiled.expandedPrompt,
    },
  };
}

function trimForTitleContext(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
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
    preview: string;
    status: "idle" | "streaming" | "failed";
    incrementMessageCount?: boolean;
    workspaceId?: Id<"workspaces">;
  },
) {
  const now = Date.now();
  const existing = await getThreadMetadata(ctx, args.threadId);
  if (existing) {
    await ctx.db.patch("threadMetadata", existing._id, {
      lastActivityAt: now,
      lastMessagePreview: args.preview,
      messageCount: existing.messageCount + (args.incrementMessageCount ? 1 : 0),
      status: args.status,
      workspaceId: existing.workspaceId ?? args.workspaceId,
    });
    return;
  }

  await ctx.db.insert("threadMetadata", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    workspaceId: args.workspaceId,
    lastActivityAt: now,
    lastMessagePreview: args.preview,
    messageCount: args.incrementMessageCount ? 1 : 0,
    status: args.status,
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
    patch: { title: threadTitleFromPrompt(args.prompt) },
  });
}

function validateContent(content: string) {
  const trimmed = content.trim();
  if (trimmed.length < 1) {
    throw new ConvexError("Message cannot be empty");
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    throw new ConvexError("Message is too long");
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
    mode: "normal" | "deep";
  },
): Promise<
  | { ok: true }
  | { ok: false; retryAt?: number; entitlement?: Extract<EntitlementResult, { ok: false }> }
> {
  const estimatedTokens = estimateTokens(args.content);
  const entitlement = await consumeCredits(ctx, {
    ownerUserId: args.ownerUserId,
    ownerEmail: args.ownerEmail,
    feature: args.mode === "deep" ? "deep_research" : "normal_chat",
    provider: "openai",
    model: args.mode === "deep" ? process.env.AQSHA_DEEP_MODEL ?? "gpt-5.5" : NORMAL_MODEL,
    inputTokens: estimatedTokens,
    totalTokens: estimatedTokens,
    credits: estimateCredits({
      feature: args.mode === "deep" ? "deep_research" : "normal_chat",
      inputTokens: estimatedTokens,
      totalTokens: estimatedTokens,
    }),
    requiredPlan: args.mode === "deep" ? "starter" : "free",
  });
  if (!entitlement.ok) {
    return { ok: false, entitlement };
  }
  const rateChecks = await Promise.all([
    rateLimiter.check(ctx, "sendMessage", { key: args.ownerUserId }),
    rateLimiter.check(ctx, "globalSendMessage"),
    rateLimiter.check(ctx, "tokenUsagePerUser", {
      key: args.ownerUserId,
      count: estimatedTokens,
    }),
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
    mode: "normal" | "deep";
    commandId?: string;
    workspaceId?: Id<"workspaces">;
    selectedContextArtifactIds?: Id<"artifacts">[];
  },
): Promise<SendResult> {
  const promptPayload = promptPayloadFromCommand(args);
  if (args.selectedContextArtifactIds) {
    await replaceContextArtifactsForThread(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactIds: args.selectedContextArtifactIds,
    });
  }

  const saved = await astra.saveMessages(ctx, {
    threadId: args.threadId,
    userId: args.ownerUserId,
    messages: [{ role: "user", content: promptPayload.visibleContent }],
    skipEmbeddings: true,
  });
  const messageId = saved.messages[0]._id;
  const preview = previewFromContent(promptPayload.visibleContent);

  if (promptPayload.commandMetadata) {
    await ctx.db.insert("messageCommands", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId,
      ...promptPayload.commandMetadata,
      createdAt: Date.now(),
    });
  }

  await upsertThreadMetadata(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    preview,
    status: "streaming",
    incrementMessageCount: true,
    workspaceId: args.workspaceId,
  });

  await updateThreadTitleFromPrompt(ctx, {
    threadId: args.threadId,
    currentTitle: args.threadTitle,
    prompt: promptPayload.visibleContent,
  });

  const contextBlock = await buildPromptContextForThread(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });
  const generationPrompt = prependPromptContext({
    prompt: promptPayload.expandedPrompt,
    contextBlock,
  });

  if (promptPayload.mode === "deep") {
    const run: {
      runId: import("../_generated/dataModel").Id<"agentRuns">;
      workflowId: string;
    } = await ctx.runMutation(internal.agent.deepResearch.startForMessage, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: messageId,
      prompt: generationPrompt,
    });

    return { ok: true as const, messageId, ...run };
  }

  const runId = await ctx.runMutation(internal.agent.messages.startInlineRun, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    promptMessageId: messageId,
    prompt: generationPrompt,
  });
  await ctx.scheduler.runAfter(0, internal.agent.messages.generateReply, {
    threadId: args.threadId,
    userId: args.ownerUserId,
    promptMessageId: messageId,
    prompt: generationPrompt,
    visiblePrompt: promptPayload.visibleContent,
    runId,
  });

  return { ok: true as const, messageId, runId };
}

export const startThread = mutation({
  args: {
    content: v.string(),
    mode: v.union(v.literal("normal"), v.literal("deep")),
    commandId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    selectedContextArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const user = await requireCurrentUser(ctx);
    const content = validateContent(args.content);
    if (args.workspaceId) {
      await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    }
    const quota = await checkAndConsumeSendQuota(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      content,
      mode: args.mode,
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
    const result = await savePromptAndScheduleRun(ctx, {
      ownerUserId: user._id,
      threadId,
      threadTitle: threadTitleFromPrompt(content),
      content,
      mode: args.mode,
      commandId: args.commandId,
      workspaceId: args.workspaceId,
      selectedContextArtifactIds: args.selectedContextArtifactIds,
    });

    return result.ok ? { ...result, threadId } : result;
  },
});

export const send = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
    mode: v.union(v.literal("normal"), v.literal("deep")),
    commandId: v.optional(v.string()),
    selectedContextArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const user = await requireCurrentUser(ctx);
    const content = validateContent(args.content);
    const thread = await assertThreadOwner(ctx, args.threadId);
    const quota = await checkAndConsumeSendQuota(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      content,
      mode: args.mode,
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
      mode: args.mode,
      commandId: args.commandId,
      selectedContextArtifactIds: args.selectedContextArtifactIds,
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
        argumentPreview: row.argumentPreview,
      });
    }
    return {
      ...paginated,
      page: paginated.page.map((message) => {
        const promptCommand = byMessageId.get(message.id);
        if (!promptCommand) {
          return message;
        }
        const existingMetadata = (message as { metadata?: unknown }).metadata;
        return {
          ...message,
          metadata: {
            ...(typeof existingMetadata === "object" && existingMetadata !== null
              ? existingMetadata
              : {}),
            promptCommand,
          },
        };
      }),
      streams,
    };
  },
});

export const generateReply = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
    visiblePrompt: v.string(),
    runId: v.optional(v.id("agentRuns")),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread || thread.userId !== args.userId) {
      throw new ConvexError("Thread not found");
    }

    try {
      const result = await astra.streamText(
        ctx,
        { threadId: args.threadId, userId: args.userId },
        { promptMessageId: args.promptMessageId, prompt: args.prompt, tools: researchTools },
        {
          saveStreamDeltas: { chunking: "word", throttleMs: 100 },
          usageHandler: handleUsage,
        },
      );
      await result.consumeStream();
      const text = await result.text;
      const steps = await result.steps;
      const sourceCandidates = collectSourceCandidates(steps);
      const artifactResults = collectArtifactResults(steps);
      const assistantMessageId = getVisibleAssistantMessageId(result.savedMessages);
      if (assistantMessageId) {
        await ctx.runMutation(internal.agent.sources.persistCited, {
          ownerUserId: args.userId,
          threadId: args.threadId,
          messageId: assistantMessageId,
          candidates: sourceCandidates,
          citedNumbers: extractCitationNumbers(text),
        });
        for (const artifact of artifactResults) {
          await ctx.runMutation(internal.agent.artifacts.attachToMessage, {
            ownerUserId: args.userId,
            threadId: args.threadId,
            messageId: assistantMessageId,
            artifactId: artifact.artifactId,
            versionId: artifact.versionId,
            relation: artifact.relation,
          });
        }
      }
      if (args.runId) {
        await ctx.runMutation(internal.agent.messages.completeInlineRun, {
          ownerUserId: args.userId,
          threadId: args.threadId,
          runId: args.runId,
          sourceCount: sourceCandidates.length,
          artifactCount: artifactResults.length,
          observations: collectToolObservations(steps),
        });
      }
      await ctx.runMutation(internal.agent.messages.markThreadIdle, {
        ownerUserId: args.userId,
        threadId: args.threadId,
        preview: previewFromContent(text),
        incrementMessageCount: true,
      });
      await ctx.scheduler.runAfter(0, internal.agent.messages.generateThreadTitle, {
        threadId: args.threadId,
        userId: args.userId,
        prompt: args.visiblePrompt,
        assistantText: text,
      });
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
        preview: FAILURE_TEXT,
      });
      throw error;
    }
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
      throw new ConvexError("Thread not found");
    }

    const fallbackTitle = threadTitleFromPrompt(args.prompt);
    if (thread.title && thread.title !== "Thread baru" && thread.title !== fallbackTitle) {
      return null;
    }

    const result = await generateObject({
      model: openai.chat(NORMAL_MODEL),
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
  },
  handler: async (ctx, args): Promise<Id<"agentRuns">> => {
    const now = Date.now();
    return await ctx.db.insert("agentRuns", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      mode: "normal",
      executionKind: "inline",
      promptSnapshot: args.prompt,
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
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId || run.threadId !== args.threadId) {
      throw new ConvexError("Run not found");
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
      status: "completed",
      currentStep: observations.at(-1)?.stepKey ?? "finalize",
      sourceCount: args.sourceCount,
      artifactCount: args.artifactCount,
      retryable: false,
      completedAt: now,
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

function collectArtifactResults(
  steps: Array<{ toolResults?: Array<{ output?: unknown }> }>,
) {
  const results: Array<{
    artifactId: Id<"artifacts">;
    versionId: Id<"artifactVersions">;
    relation: "created" | "updated";
  }> = [];
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (isArtifactToolResult(result.output)) {
        results.push(result.output);
      }
    }
  }
  return results;
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
      if (isArtifactToolResult(output)) {
        observations.push({
          stepKey: "artifact",
          label: output.relation === "updated" ? "Memperbarui artifact" : "Membuat artifact",
          summary: output.relation === "updated" ? "Artifact diperbarui" : "Artifact dibuat",
          artifactCount: 1,
          eventType: "artifact",
          eventTitle: "Artifact",
          eventSummary: `${output.relation}: ${output.artifactId}`,
          metadataJson: JSON.stringify({ toolName, artifactId: output.artifactId, versionId: output.versionId }),
        });
      }
    }
  }
  return observations;
}

function inferToolName(output: unknown) {
  if (Array.isArray(output) && output.some(isSourceCandidate)) {
    return "searchWeb";
  }
  if (isArtifactToolResult(output)) {
    return output.relation === "updated" ? "updateArtifact" : "createArtifact";
  }
  return "tool";
}

function providerLabel(candidates: SourceCandidate[]) {
  const providers = [
    ...new Set(candidates.map((candidate) => candidate.provider ?? candidate.origin)),
  ];
  return providers.length > 0 ? providers.join(", ") : "provider eksternal";
}

function isArtifactToolResult(value: unknown): value is {
  artifactId: Id<"artifacts">;
  versionId: Id<"artifactVersions">;
  relation: "created" | "updated";
} {
  if (!value || typeof value !== "object") {
    return false;
  }
  const result = value as {
    artifactId?: unknown;
    versionId?: unknown;
    relation?: unknown;
  };
  return (
    typeof result.artifactId === "string" &&
    typeof result.versionId === "string" &&
    (result.relation === "created" || result.relation === "updated")
  );
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
    preview: v.string(),
    incrementMessageCount: v.boolean(),
  },
  handler: async (ctx, args) => {
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
    preview: v.string(),
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    await Promise.all([
      rateLimiter.limit(ctx, "tokenUsagePerUser", {
        key: args.ownerUserId,
        count: args.totalTokens,
      }),
      rateLimiter.limit(ctx, "globalTokenUsage", { count: args.totalTokens }),
    ]);
    await ctx.db.insert("usageLedger", {
      ...args,
      model: args.model || NORMAL_MODEL,
      createdAt: Date.now(),
    });
    await recordProviderUsage(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      feature: "normal_chat",
      provider: args.provider,
      model: args.model || NORMAL_MODEL,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      credits: estimateCredits({
        feature: "normal_chat",
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        totalTokens: args.totalTokens,
      }),
    });
  },
});
