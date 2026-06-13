import { generateObject } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { CHAT_LITE_MODEL } from "./models";
import { chatProvider } from "./providers/providers";
import { findThread } from "./service/model";

// Auto-generated chat thread titles. A thread is created with no title and
// renders the "Percakapan baru" fallback (agent/v2/queries.ts) until the first
// turn completes. finalizeRun (agent/service.ts) then claims the thread —
// titleStatus undefined → "generating", inside its own transaction, so the
// generator is scheduled at most once even under duplicate/concurrent
// finalizeRun calls — and dispatches generateThreadTitle. Resolution is
// terminal (titleStatus → "ready"), so the LLM runs once per thread.

const MAX_THREAD_TITLE_LENGTH = 80;
const TITLE_CONTEXT_LIMIT = 1_500;
const TITLE_CONTEXT_MESSAGES = 20;

// Titles the model sometimes emits when it echoes the instruction instead of
// summarizing the conversation — never surface these.
const BLOCKED_GENERATED_TITLES = new Set([
  "request for thread title generation",
  "thread title generation",
  "generate thread title",
  "title generation request",
  "percakapan baru",
  "chat baru",
  "untitled",
]);

/** Collapse whitespace and clamp to the title length on a word boundary. */
export function truncateThreadTitle(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_THREAD_TITLE_LENGTH) {
    return collapsed;
  }
  const slice = collapsed.slice(0, MAX_THREAD_TITLE_LENGTH - 1).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const prefix = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${prefix}…`;
}

/** Collapse and trim, strip wrapping quotes/backticks the model adds, clamp. */
export function normalizeGeneratedThreadTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const unquoted = collapsed.replace(/^["'`]+|["'`]+$/g, "").trim();
  return truncateThreadTitle(unquoted);
}

/** Reject empty, fallback, and instruction-echo titles. */
export function isUsableGeneratedThreadTitle(title: string): boolean {
  const normalized = normalizeGeneratedThreadTitle(title);
  const lower = normalized.toLowerCase().replace(/[.…]+$/g, "").trim();
  return (
    normalized.length > 0 &&
    !BLOCKED_GENERATED_TITLES.has(lower) &&
    !lower.startsWith("request for ")
  );
}

function trimForTitleContext(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > TITLE_CONTEXT_LIMIT
    ? `${singleLine.slice(0, TITLE_CONTEXT_LIMIT - 1).trimEnd()}…`
    : singleLine;
}

// ── generator (claimed once by finalizeRun) ─────────────────────────────────

/**
 * First user prompt + first completed assistant answer for a thread. Returns
 * null when the thread is gone or already titled (defensive — the claim should
 * already guarantee a single eligible call).
 */
export const getTitleContext = internalQuery({
  args: { threadId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ prompt: v.string(), assistantText: v.string() }),
  ),
  handler: async (ctx, args) => {
    const thread = await findThread(ctx, args.threadId);
    if (!thread || thread.title) {
      return null;
    }
    // Ascending by [threadId, createdAt] — earliest messages first.
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .take(TITLE_CONTEXT_MESSAGES);
    const prompt = messages.find(
      (message) => message.role === "user" && message.text.trim().length > 0,
    )?.text;
    if (!prompt) {
      return null;
    }
    const assistantText =
      messages.find(
        (message) =>
          message.role === "assistant" &&
          message.status === "complete" &&
          message.text.trim().length > 0,
      )?.text ?? "";
    return { prompt, assistantText };
  },
});

/**
 * Terminal resolution of the title claim: always marks titleStatus "ready" so
 * the generator never runs twice, and sets the title only when a usable one was
 * produced and none was set in the meantime.
 */
export const applyThreadTitle = internalMutation({
  args: { threadId: v.string(), title: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await findThread(ctx, args.threadId);
    if (!thread) {
      return null;
    }
    const patch: { titleStatus: "ready"; title?: string } = {
      titleStatus: "ready",
    };
    if (args.title && !thread.title) {
      patch.title = args.title;
    }
    await ctx.db.patch("chatThreads", thread._id, patch);
    return null;
  },
});

export const generateThreadTitle = internalAction({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    let title: string | undefined;
    try {
      const context = await ctx.runQuery(
        internal.agent.threadTitles.getTitleContext,
        { threadId: args.threadId },
      );
      if (context) {
        const result = await generateObject({
          model: chatProvider.chat(CHAT_LITE_MODEL),
          maxOutputTokens: 80,
          schema: z.object({
            title: z
              .string()
              .min(1)
              .max(MAX_THREAD_TITLE_LENGTH)
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
            `User prompt:\n${trimForTitleContext(context.prompt)}`,
            "",
            `Assistant answer:\n${trimForTitleContext(context.assistantText)}`,
          ].join("\n"),
        });
        const candidate = normalizeGeneratedThreadTitle(result.object.title);
        if (isUsableGeneratedThreadTitle(candidate)) {
          title = candidate;
        }
      }
    } catch {
      // Transient LLM/provider failure — fall through and mark the claim
      // terminal so we don't retry on every later turn. The thread keeps the
      // default fallback title.
      title = undefined;
    }
    await ctx.runMutation(internal.agent.threadTitles.applyThreadTitle, {
      threadId: args.threadId,
      title,
    });
    return null;
  },
});
