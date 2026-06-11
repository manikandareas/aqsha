import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation, type MutationCtx } from "../../_generated/server";
import { requireCurrentUser } from "../../auth";
import { astra, type AgentKind } from "../runtime";
import { assertThreadOwner } from "../threads";

// Native HITL resolution. The user answers an askUser question or approves /
// denies a needsApproval action tool; each writes a native message into the
// thread (tool-result or tool-approval-response) and returns its messageId.
//
// Resuming generation is a SEPARATE step (resumeHitl) so the client can resolve
// EVERY pending tool call on a step before continuing — if a new generation
// starts while approvals are still unresolved, the component auto-denies them.
// The client tracks the last resolved messageId and calls resumeHitl once no
// pending HITL tool parts remain (mirrors the component's reference UI).

const askUserAnswerValidator = v.array(
  v.object({
    prompt: v.string(),
    selectedOptionIds: v.optional(v.array(v.string())),
    customAnswer: v.optional(v.string()),
    skipped: v.optional(v.boolean()),
  }),
);

// Flip the paused run for this thread back to running and mark the thread as
// streaming again, so run lifecycle and composer state stay consistent across
// the pause/resume boundary.
async function beginResume(
  ctx: MutationCtx,
  ownerUserId: string,
  threadId: string,
): Promise<{ runId?: Id<"agentRuns">; agentKind: AgentKind; isDeep: boolean }> {
  // AUD-07: resolve the paused run via the index (newest waiting_hitl preferred,
  // else plan-approval waiting) instead of scanning the last 8 runs.
  let run: Doc<"agentRuns"> | null = null;
  for (const status of ["waiting_hitl", "waiting"] as const) {
    run = await ctx.db
      .query("agentRuns")
      .withIndex("by_owner_thread_status", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("threadId", threadId).eq("status", status),
      )
      .order("desc")
      .first();
    if (run) break;
  }
  const now = Date.now();
  if (run) {
    await ctx.db.patch("agentRuns", run._id, { status: "running", updatedAt: now });
  }
  const metadata = await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
  if (metadata) {
    await ctx.db.patch("threadMetadata", metadata._id, {
      status: "streaming",
      lastActivityAt: now,
    });
  }
  return {
    runId: run?._id,
    agentKind: run?.agentKind ?? "lite",
    isDeep: run?.mode === "deep",
  };
}

export const answerAskUser = mutation({
  args: {
    threadId: v.string(),
    toolCallId: v.string(),
    answers: askUserAnswerValidator,
  },
  returns: v.object({ ok: v.literal(true), messageId: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    const saved = await astra.saveMessage(ctx, {
      threadId: args.threadId,
      userId: user._id,
      message: {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: args.toolCallId,
            toolName: "askUser",
            output: { type: "json", value: { answers: args.answers } },
          },
        ],
      },
      metadata: { provider: "human" },
    });
    return { ok: true as const, messageId: saved.messageId };
  },
});

export const approveTool = mutation({
  args: {
    threadId: v.string(),
    approvalId: v.string(),
    // Optional workspace chosen at approval time (used when the proposed action
    // could not resolve a workspace). Injection into the tool call is handled in
    // Phase 2.3; accepted here so the client contract is stable.
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.object({ ok: v.literal(true), messageId: v.string() }),
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    const { messageId } = await astra.approveToolCall(ctx, {
      threadId: args.threadId,
      approvalId: args.approvalId,
    });
    return { ok: true as const, messageId };
  },
});

export const denyTool = mutation({
  args: {
    threadId: v.string(),
    approvalId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true), messageId: v.string() }),
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    const { messageId } = await astra.denyToolCall(ctx, {
      threadId: args.threadId,
      approvalId: args.approvalId,
      reason: args.reason,
    });
    return { ok: true as const, messageId };
  },
});

// Resume generation once all pending HITL tool calls on the latest step are
// resolved. `promptMessageId` is the last resolved tool-result /
// tool-approval-response message, so the model continues with the answer(s) in
// context.
export const resumeHitl = mutation({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    const { runId, agentKind, isDeep } = await beginResume(
      ctx,
      user._id,
      args.threadId,
    );
    await ctx.scheduler.runAfter(0, internal.agent.messages.resumeGeneration, {
      threadId: args.threadId,
      userId: user._id,
      promptMessageId: args.promptMessageId,
      runId,
      agentKind,
      deep: isDeep,
    });
    return { ok: true as const };
  },
});
