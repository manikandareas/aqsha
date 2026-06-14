import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { findThread } from "./service/model";

// Public read surface for the SDK agent backend (plan §9.4 Step 2): the web
// data-hooks subscribe to these instead of the legacy @convex-dev/agent
// queries when AGENT_BACKEND=sdk. Auth at the boundary: every query resolves
// the current user and only ever returns rows it owns. Shapes are raw agent rows;
// the UI adapts them via @aqsha/agent-contracts adapters.

const MAX_THREADS = 50;
const MAX_MESSAGES = 100;
const MAX_RUNS = 10;
// Matches the service-side cap (`MAX_RUN_EVENTS = 500` in service.ts): events are
// taken via `by_run_seq` in ASCENDING seq, so a run that exceeds this would drop
// its HIGHEST-seq events. The answer-stream redesign emits ordered answer segments
// into the same per-run seq space and the final answer is the last `text_segment`
// (highest seq), so dropping the tail would truncate the answer. 500 gives headroom
// for heavy deep-research runs (5 phases, sub-agent tools, segment pairs).
const MAX_EVENTS_PER_RUN = 500;
const MAX_INTERACTIONS = 100;

async function ownedThread(
  ctx: QueryCtx,
  threadId: string,
  ownerUserId: string,
): Promise<Doc<"chatThreads"> | null> {
  const thread = await findThread(ctx, threadId);
  return thread && thread.ownerUserId === ownerUserId ? thread : null;
}

export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const threads = await ctx.db
      .query("chatThreads")
      .withIndex("by_owner_activity", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(MAX_THREADS);
    return threads.map((thread) => ({
      threadId: thread.threadId,
      workspaceId: thread.workspaceId ? String(thread.workspaceId) : undefined,
      title: thread.title ?? "Percakapan baru",
      createdAt: thread._creationTime,
      lastActivityAt: thread.lastActivityAt,
      lastMessagePreview: thread.lastMessagePreview ?? "",
      messageCount: thread.messageCount,
      status: thread.status,
      lastAgentKind: thread.agentKind,
    }));
  },
});

export const listThreadsByWorkspace = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    // chatThreads is indexed by owner+activity, not workspace; dev-scale thread
    // counts make an owner scan + in-memory workspace filter cheap and correct.
    const threads = await ctx.db
      .query("chatThreads")
      .withIndex("by_owner_activity", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(MAX_THREADS);
    return threads
      .filter((thread) => thread.workspaceId && String(thread.workspaceId) === args.workspaceId)
      .map((thread) => ({
        threadId: thread.threadId,
        workspaceId: thread.workspaceId ? String(thread.workspaceId) : undefined,
        title: thread.title ?? "Percakapan baru",
        createdAt: thread._creationTime,
        lastActivityAt: thread.lastActivityAt,
        lastMessagePreview: thread.lastMessagePreview ?? "",
        messageCount: thread.messageCount,
        status: thread.status,
        lastAgentKind: thread.agentKind,
      }));
  },
});

export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await ownedThread(ctx, args.threadId, user._id);
    if (!thread) {
      return null;
    }
    return {
      threadId: thread.threadId,
      title: thread.title ?? "Percakapan baru",
      status: thread.status,
      workspaceId: thread.workspaceId ? String(thread.workspaceId) : undefined,
      lastAgentKind: thread.agentKind,
    };
  },
});

export const listMessages = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await ownedThread(ctx, args.threadId, user._id);
    if (!thread) {
      return [];
    }
    const docs = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(MAX_MESSAGES);
    return docs.reverse().map((message) => ({
      messageId: String(message._id),
      role: message.role,
      text: message.text,
      reasoning: message.reasoning,
      runId: message.runId,
      status: message.status,
      createdAt: message.createdAt,
    }));
  },
});

export const listRuns = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await ownedThread(ctx, args.threadId, user._id);
    if (!thread) {
      return [];
    }
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(MAX_RUNS);
    const withEvents = await Promise.all(
      runs.reverse().map(async (run) => {
        const events = await ctx.db
          .query("agentRunEvents")
          .withIndex("by_run_seq", (q) => q.eq("runId", run.runId))
          .take(MAX_EVENTS_PER_RUN);
        return {
          runId: run.runId,
          promptMessageId: run.promptMessageId,
          status: run.status,
          mode: run.mode,
          agentKind: run.agentKind,
          costUsd: run.costUsd,
          numTurns: run.numTurns,
          errorMessage: run.errorMessage,
          verificationReportJson: run.verificationReportJson,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          events: events.map((event) => ({
            id: `${event.runId}:${event.seq}`,
            seq: event.seq,
            type: event.type,
            payloadJson: event.payloadJson,
            createdAt: event.createdAt,
          })),
        };
      }),
    );
    return withEvents;
  },
});

const MAX_ARTIFACTS = 50;

// Per-thread artifact panel (plan §9.4 Step 3): the service links artifacts it
// writes to their thread via `artifacts.threadId` (a `thr_*` string), so the
// legacy `by_owner_thread_created` index serves the sdk backend unchanged.
export const listArtifacts = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await ownedThread(ctx, args.threadId, user._id);
    if (!thread) {
      return [];
    }
    const docs = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(MAX_ARTIFACTS);
    return docs
      .filter((doc) => doc.status !== "deleted")
      .map((doc) => ({
        _id: String(doc._id),
        title: doc.title,
        artifactType: doc.artifactType,
        currentVersionId: doc.currentVersionId
          ? String(doc.currentVersionId)
          : undefined,
        source: doc.source,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
  },
});

export const listPendingInteractions = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await ownedThread(ctx, args.threadId, user._id);
    if (!thread) {
      return [];
    }
    const docs = await ctx.db
      .query("pendingInteractions")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(MAX_INTERACTIONS);
    return docs
      .filter((doc) => doc.status === "pending")
      .reverse()
      .map((doc) => ({
        id: String(doc._id),
        runId: doc.runId,
        type: doc.type,
        toolName: doc.toolName,
        payloadJson: doc.payloadJson,
        createdAt: doc.createdAt,
      }));
  },
});
