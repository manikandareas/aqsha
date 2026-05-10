import {
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { astra, NORMAL_MODEL, recordUsage as handleUsage } from "./agent";
import { requireCurrentUser } from "./auth";
import { rateLimiter } from "./limits";
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
  }),
  v.object({
    ok: v.literal(false),
    reason: v.literal("rate_limited"),
    retryAt: v.number(),
  }),
);

function previewFromContent(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function titleFromContent(content: string) {
  const preview = previewFromContent(content);
  return preview.length > 60 ? `${preview.slice(0, 57)}...` : preview;
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
    mode: v.literal("normal"),
  },
  returns: sendResultValidator,
  handler: async (ctx, args) => {
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

    if (!thread.title || thread.title === "Thread baru") {
      await astra.updateThreadMetadata(ctx, {
        threadId: args.threadId,
        patch: { title: titleFromContent(content) },
      });
    }

    await ctx.scheduler.runAfter(0, internal.messages.generateReply, {
      threadId: args.threadId,
      userId: user._id,
      promptMessageId: messageId,
    });

    return { ok: true as const, messageId };
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
      const assistantMessageId = getAssistantMessageId(result.savedMessages);
      if (assistantMessageId) {
        await ctx.runMutation(internal.sources.persistCited, {
          ownerUserId: args.userId,
          threadId: args.threadId,
          messageId: assistantMessageId,
          candidates: collectSourceCandidates(steps),
          citedNumbers: extractCitationNumbers(text),
        });
      }
      await ctx.runMutation(internal.messages.markThreadIdle, {
        ownerUserId: args.userId,
        threadId: args.threadId,
        preview: previewFromContent(text),
        incrementMessageCount: true,
      });
    } catch (error) {
      await astra.saveMessages(ctx, {
        threadId: args.threadId,
        userId: args.userId,
        promptMessageId: args.promptMessageId,
        messages: [{ role: "assistant", content: FAILURE_TEXT }],
        failPendingSteps: true,
        skipEmbeddings: true,
      });
      await ctx.runMutation(internal.messages.markThreadFailed, {
        ownerUserId: args.userId,
        threadId: args.threadId,
        preview: FAILURE_TEXT,
      });
      throw error;
    }
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

function getAssistantMessageId(
  savedMessages:
    | Array<{ _id: string; message?: { role?: string }; role?: string }>
    | undefined,
) {
  return savedMessages
    ?.filter((message) => (message.message?.role ?? message.role) === "assistant")
    .at(-1)?._id;
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
