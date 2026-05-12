import {
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
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
import { rateLimiter } from "../limits";
import { researchTools } from "./researchTools";
import type { SourceCandidate } from "./sourceCandidates";
import { assertThreadOwner } from "./threads";

const MAX_CONTENT_LENGTH = 8_000;
const FAILURE_TEXT =
  "Astra belum bisa menjawab pesan ini. Coba kirim ulang sebentar lagi.";

const sendResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    messageId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    workflowId: v.optional(v.string()),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.literal("rate_limited"),
    retryAt: v.number(),
  }),
);

type SendResult =
  | {
      ok: true;
      messageId: string;
      runId?: import("../_generated/dataModel").Id<"agentRuns">;
      workflowId?: string;
    }
  | { ok: false; reason: "rate_limited"; retryAt: number };

function previewFromContent(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function estimateTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

function shouldGenerateThreadTitle(title: string | undefined) {
  return !title || title === "Thread baru";
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
    });
    return;
  }

  await ctx.db.insert("threadMetadata", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    lastActivityAt: now,
    lastMessagePreview: args.preview,
    messageCount: args.incrementMessageCount ? 1 : 0,
    status: args.status,
  });
}

export const send = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
    mode: v.union(v.literal("normal"), v.literal("deep")),
  },
  returns: sendResultValidator,
  handler: async (ctx, args): Promise<SendResult> => {
    const user = await requireCurrentUser(ctx);
    const content = args.content.trim();
    if (content.length < 1) {
      throw new ConvexError("Message cannot be empty");
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new ConvexError("Message is too long");
    }

    const thread = await assertThreadOwner(ctx, args.threadId);
    const estimatedTokens = estimateTokens(content);
    const rateChecks = await Promise.all([
      rateLimiter.check(ctx, "sendMessage", { key: user._id }),
      rateLimiter.check(ctx, "globalSendMessage"),
      rateLimiter.check(ctx, "tokenUsagePerUser", {
        key: user._id,
        count: estimatedTokens,
      }),
      rateLimiter.check(ctx, "globalTokenUsage", { count: estimatedTokens }),
    ]);
    const blocked = rateChecks.find((status) => !status.ok);
    if (blocked && !blocked.ok) {
      return {
        ok: false as const,
        reason: "rate_limited" as const,
        retryAt: Date.now() + blocked.retryAfter,
      };
    }
    await Promise.all([
      rateLimiter.limit(ctx, "sendMessage", { key: user._id }),
      rateLimiter.limit(ctx, "globalSendMessage"),
    ]);

    const saved = await astra.saveMessages(ctx, {
      threadId: args.threadId,
      userId: user._id,
      messages: [{ role: "user", content }],
      skipEmbeddings: true,
    });
    const messageId = saved.messages[0]._id;
    const preview = previewFromContent(content);

    await upsertThreadMetadata(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
      preview,
      status: "streaming",
      incrementMessageCount: true,
    });

    if (shouldGenerateThreadTitle(thread.title)) {
      await ctx.scheduler.runAfter(0, internal.agent.messages.generateThreadTitle, {
        threadId: args.threadId,
        userId: user._id,
      });
    }

    if (args.mode === "deep") {
      const run: { runId: import("../_generated/dataModel").Id<"agentRuns">; workflowId: string } = await ctx.runMutation(internal.agent.deepResearch.startForMessage, {
        ownerUserId: user._id,
        threadId: args.threadId,
        promptMessageId: messageId,
        prompt: content,
      });

      return { ok: true as const, messageId, ...run };
    }

    const runId = await ctx.runMutation(internal.agent.messages.startInlineRun, {
      ownerUserId: user._id,
      threadId: args.threadId,
      promptMessageId: messageId,
      prompt: content,
    });
    await ctx.scheduler.runAfter(0, internal.agent.messages.generateReply, {
      threadId: args.threadId,
      userId: user._id,
      promptMessageId: messageId,
      runId,
    });

    return { ok: true as const, messageId, runId };
  },
});

export const list = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    await assertThreadOwner(ctx, args.threadId);
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

export const generateReply = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
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
        { promptMessageId: args.promptMessageId, tools: researchTools },
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
      const latestThread = await ctx.runQuery(components.agent.threads.getThread, {
        threadId: args.threadId,
      });
      if (shouldGenerateThreadTitle(latestThread?.title)) {
        await ctx.scheduler.runAfter(0, internal.agent.messages.generateThreadTitle, {
          threadId: args.threadId,
          userId: args.userId,
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
        preview: FAILURE_TEXT,
      });
      throw error;
    }
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

export const generateThreadTitle = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const metadata = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!metadata || metadata.userId !== args.userId) {
      throw new ConvexError("Thread not found");
    }
    if (!shouldGenerateThreadTitle(metadata.title)) {
      return null;
    }

    const { thread } = await astra.continueThread(ctx, {
      threadId: args.threadId,
      userId: args.userId,
    });
    const {
      object: { title },
    } = await thread.generateObject(
      {
        schemaDescription:
          "Generate a concise thread title from the existing conversation. The title should capture the user's core research intent and should not be a generic greeting.",
        schema: z.object({
          title: z
            .string()
            .min(1)
            .describe("A concise, specific title for the thread, at most 80 characters"),
        }),
        prompt:
          "Generate a concise title for this thread. Return only the structured title field.",
      },
      { storageOptions: { saveMessages: "none" } },
    );

    const normalizedTitle = title.replace(/\s+/g, " ").trim();
    if (!normalizedTitle) {
      return null;
    }

    await thread.updateMetadata({
      title:
        normalizedTitle.length > 80
          ? `${normalizedTitle.slice(0, 77)}...`
          : normalizedTitle,
    });
    return null;
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
            stepKey: toolName === "searchCorpus" ? "searchCorpus" : "searchWeb",
            label: toolName === "searchCorpus" ? "Mencari corpus" : "Mencari sumber",
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
    const first = output.find(isSourceCandidate);
    return first?.origin === "corpus" ? "searchCorpus" : "searchWeb";
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
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (shouldGenerateThreadTitle(thread?.title)) {
      await ctx.scheduler.runAfter(0, internal.agent.messages.generateThreadTitle, {
        threadId: args.threadId,
        userId: args.ownerUserId,
      });
    }
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
  },
});
