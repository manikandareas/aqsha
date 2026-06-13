import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  action,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server";
import { plainTextFromMarkdown } from "../artifacts/model";
import { throwAppError } from "../lib/appError";
import { ensureDefaultWorkspaceForOwner } from "../workspaces/defaults";
import {
  bumpThreadOnMessage,
  findRun,
  findThread,
  interactionRecord,
  messagePreview,
  messageRecord,
  nextRunEventSeq,
  requireRun,
  requireThread,
  requireServiceToken,
  researchPhaseRecord,
  runEventRecord,
  runRecord,
  threadRecord,
} from "./service/model";

// Service facade for apps/agents (plan §4.5 / §9.4 Step 1). These are the 25
// endpoints of SERVICE_FUNCTIONS in apps/agents/src/store/convexStore.ts —
// args must stay in lockstep with that contract. All functions are public
// (called over ConvexHttpClient) and authenticate exclusively through the
// shared AGENTS_SERVICE_TOKEN; requireServiceToken is the security boundary
// and must stay the first statement of every handler.

const agentKindValidator = v.union(v.literal("lite"), v.literal("pro"));
const runModeValidator = v.union(v.literal("normal"), v.literal("deep"));
const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("waiting_hitl"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);
const threadStatusValidator = v.union(
  v.literal("idle"),
  v.literal("streaming"),
  v.literal("failed"),
);
const messageRoleValidator = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
);
const messageStatusValidator = v.union(
  v.literal("streaming"),
  v.literal("complete"),
  v.literal("error"),
);
const interactionTypeValidator = v.union(
  v.literal("ask_user"),
  v.literal("tool_approval"),
);

const MAX_LIST_MESSAGES = 200;
const MAX_RUN_EVENTS = 500;
const MAX_THREAD_INTERACTIONS = 100;
const MAX_CONTEXT_ARTIFACTS = 8;
const MAX_MANIFEST_ITEMS = 30;

// ── threads ──────────────────────────────────────────────────────────────────

export const getThread = query({
  args: { serviceToken: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const thread = await findThread(ctx, args.threadId);
    return thread ? threadRecord(thread) : null;
  },
});

export const upsertThread = mutation({
  args: {
    serviceToken: v.string(),
    threadId: v.string(),
    ownerUserId: v.string(),
    agentKind: agentKindValidator,
    workspaceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await findThread(ctx, args.threadId);
    if (existing) {
      if (existing.ownerUserId !== args.ownerUserId) {
        throwAppError({
          message: "Thread belongs to another user",
          code: "thread_owner_mismatch",
        });
      }
      return threadRecord(existing);
    }
    const workspaceId = args.workspaceId
      ? (ctx.db.normalizeId("workspaces", args.workspaceId) ?? undefined)
      : undefined;
    const id = await ctx.db.insert("chatThreads", {
      threadId: args.threadId,
      ownerUserId: args.ownerUserId,
      agentKind: args.agentKind,
      workspaceId,
      status: "idle",
      lastActivityAt: Date.now(),
      messageCount: 0,
    });
    const inserted = await ctx.db.get("chatThreads", id);
    return threadRecord(inserted!);
  },
});

export const setThreadSession = mutation({
  args: {
    serviceToken: v.string(),
    threadId: v.string(),
    sdkSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const thread = await requireThread(ctx, args.threadId);
    await ctx.db.patch("chatThreads", thread._id, {
      sdkSessionId: args.sdkSessionId,
    });
    return null;
  },
});

export const setThreadStatus = mutation({
  args: {
    serviceToken: v.string(),
    threadId: v.string(),
    status: threadStatusValidator,
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const thread = await requireThread(ctx, args.threadId);
    await ctx.db.patch("chatThreads", thread._id, {
      status: args.status,
      lastActivityAt: Date.now(),
    });
    return null;
  },
});

// ── messages ─────────────────────────────────────────────────────────────────

export const createMessage = mutation({
  args: {
    serviceToken: v.string(),
    threadId: v.string(),
    ownerUserId: v.string(),
    role: messageRoleValidator,
    text: v.string(),
    runId: v.optional(v.string()),
    status: messageStatusValidator,
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const thread = await requireThread(ctx, args.threadId);
    const id = await ctx.db.insert("chatMessages", {
      threadId: args.threadId,
      ownerUserId: args.ownerUserId,
      role: args.role,
      text: args.text,
      runId: args.runId,
      status: args.status,
      createdAt: Date.now(),
    });
    await bumpThreadOnMessage(ctx, thread, { text: args.text, countDelta: 1 });
    const inserted = await ctx.db.get("chatMessages", id);
    return messageRecord(inserted!);
  },
});

async function requireMessage(ctx: QueryCtx, messageId: string) {
  const id = ctx.db.normalizeId("chatMessages", messageId);
  const message = id ? await ctx.db.get("chatMessages", id) : null;
  if (!message) {
    throwAppError({ message: "Message not found", code: "message_not_found" });
  }
  return message;
}

export const updateMessageText = mutation({
  args: { serviceToken: v.string(), messageId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const message = await requireMessage(ctx, args.messageId);
    await ctx.db.patch("chatMessages", message._id, { text: args.text });
    return null;
  },
});

export const finalizeMessage = mutation({
  args: {
    serviceToken: v.string(),
    messageId: v.string(),
    text: v.string(),
    status: v.union(v.literal("complete"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const message = await requireMessage(ctx, args.messageId);
    await ctx.db.patch("chatMessages", message._id, {
      text: args.text,
      status: args.status,
    });
    const thread = await findThread(ctx, message.threadId);
    if (thread && args.text.trim()) {
      await ctx.db.patch("chatThreads", thread._id, {
        lastActivityAt: Date.now(),
        lastMessagePreview: messagePreview(args.text),
      });
    }
    return null;
  },
});

export const listMessages = query({
  args: { serviceToken: v.string(), threadId: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const limit = Math.min(Math.max(1, Math.floor(args.limit)), MAX_LIST_MESSAGES);
    const docs = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
    return docs.reverse().map(messageRecord);
  },
});

// ── runs ─────────────────────────────────────────────────────────────────────

export const createRun = mutation({
  args: {
    serviceToken: v.string(),
    runId: v.string(),
    threadId: v.string(),
    ownerUserId: v.string(),
    agentKind: agentKindValidator,
    mode: runModeValidator,
    promptMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await findRun(ctx, args.runId);
    if (existing) {
      // Idempotent retry from the service.
      return runRecord(existing);
    }
    const now = Date.now();
    const id = await ctx.db.insert("agentRuns2", {
      runId: args.runId,
      threadId: args.threadId,
      ownerUserId: args.ownerUserId,
      agentKind: args.agentKind,
      mode: args.mode,
      promptMessageId: args.promptMessageId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await ctx.db.get("agentRuns2", id);
    return runRecord(inserted!);
  },
});

export const getRun = query({
  args: { serviceToken: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const run = await findRun(ctx, args.runId);
    return run ? runRecord(run) : null;
  },
});

export const setRunStatus = mutation({
  args: {
    serviceToken: v.string(),
    runId: v.string(),
    status: runStatusValidator,
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const run = await requireRun(ctx, args.runId);
    // A user cancel recorded by agent.v2.cancelRun is sticky — the service may
    // still be streaming and must not revive the run (plan §9.4 Step 3).
    if (run.status === "canceled") {
      return null;
    }
    await ctx.db.patch("agentRuns2", run._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const finalizeRun = mutation({
  args: {
    serviceToken: v.string(),
    runId: v.string(),
    status: runStatusValidator,
    sdkSessionId: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    usage: v.optional(
      v.object({
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        cacheReadInputTokens: v.optional(v.number()),
        cacheCreationInputTokens: v.optional(v.number()),
      }),
    ),
    numTurns: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const run = await requireRun(ctx, args.runId);
    // Canceled stays canceled (durable cancel) — still record cost/usage/session
    // from the service's late finalization, but never the terminal status.
    const status = run.status === "canceled" ? "canceled" : args.status;
    await ctx.db.patch("agentRuns2", run._id, {
      status,
      sdkSessionId: args.sdkSessionId ?? run.sdkSessionId,
      costUsd: args.costUsd ?? run.costUsd,
      usageJson: args.usage ? JSON.stringify(args.usage) : run.usageJson,
      numTurns: args.numTurns ?? run.numTurns,
      errorMessage: status === "canceled" ? run.errorMessage : args.errorMessage,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setRunVerificationReport = mutation({
  args: {
    serviceToken: v.string(),
    runId: v.string(),
    verificationReportJson: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const run = await requireRun(ctx, args.runId);
    await ctx.db.patch("agentRuns2", run._id, {
      verificationReportJson: args.verificationReportJson,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const appendRunEvent = mutation({
  args: {
    serviceToken: v.string(),
    runId: v.string(),
    type: v.string(),
    payloadJson: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const run = await requireRun(ctx, args.runId);
    const seq = await nextRunEventSeq(ctx, args.runId);
    const now = Date.now();
    const id = await ctx.db.insert("agentRunEvents2", {
      runId: args.runId,
      seq,
      type: args.type,
      payloadJson: args.payloadJson,
      createdAt: now,
    });
    // Events double as the run heartbeat for the watchdog sweep.
    await ctx.db.patch("agentRuns2", run._id, { updatedAt: now });
    const inserted = await ctx.db.get("agentRunEvents2", id);
    return runEventRecord(inserted!);
  },
});

export const listRunEvents = query({
  args: { serviceToken: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const docs = await ctx.db
      .query("agentRunEvents2")
      .withIndex("by_run_seq", (q) => q.eq("runId", args.runId))
      .take(MAX_RUN_EVENTS);
    return docs.map(runEventRecord);
  },
});

// ── interactions (HITL, plan §5.3) ───────────────────────────────────────────

export const createInteraction = mutation({
  args: {
    serviceToken: v.string(),
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.string(),
    type: interactionTypeValidator,
    toolName: v.string(),
    toolUseId: v.optional(v.string()),
    payloadJson: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const id = await ctx.db.insert("pendingInteractions", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      type: args.type,
      toolName: args.toolName,
      toolUseId: args.toolUseId,
      payloadJson: args.payloadJson,
      status: "pending",
      createdAt: Date.now(),
    });
    const inserted = await ctx.db.get("pendingInteractions", id);
    return interactionRecord(inserted!);
  },
});

async function findInteraction(ctx: QueryCtx, interactionId: string) {
  const id = ctx.db.normalizeId("pendingInteractions", interactionId);
  return id ? await ctx.db.get("pendingInteractions", id) : null;
}

export const getInteraction = query({
  args: { serviceToken: v.string(), interactionId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const doc = await findInteraction(ctx, args.interactionId);
    return doc ? interactionRecord(doc) : null;
  },
});

export const respondInteraction = mutation({
  args: {
    serviceToken: v.string(),
    interactionId: v.string(),
    responseJson: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const doc = await findInteraction(ctx, args.interactionId);
    if (!doc || doc.status !== "pending") {
      return null;
    }
    await ctx.db.patch("pendingInteractions", doc._id, {
      status: "responded",
      responseJson: args.responseJson,
      respondedAt: Date.now(),
    });
    const updated = await ctx.db.get("pendingInteractions", doc._id);
    return interactionRecord(updated!);
  },
});

export const expireInteraction = mutation({
  args: { serviceToken: v.string(), interactionId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const doc = await findInteraction(ctx, args.interactionId);
    if (doc && doc.status === "pending") {
      await ctx.db.patch("pendingInteractions", doc._id, { status: "expired" });
    }
    return null;
  },
});

export const listInteractions = query({
  args: { serviceToken: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const docs = await ctx.db
      .query("pendingInteractions")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(MAX_THREAD_INTERACTIONS);
    return docs.reverse().map(interactionRecord);
  },
});

// ── deep-research phase state (plan §5.5 durable orchestration, Step 4) ─────
// Additive contract extension: SERVICE_FUNCTIONS grew from 25 to 27 endpoints
// (recorded in plan §9.2).

const deepPhaseValidator = v.union(
  v.literal("plan"),
  v.literal("literature"),
  v.literal("counter_evidence"),
  v.literal("citation_verify"),
  v.literal("write"),
);

export const upsertResearchPhase = mutation({
  args: {
    serviceToken: v.string(),
    runId: v.string(),
    phase: deepPhaseValidator,
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    output: v.optional(v.string()),
    sdkSessionId: v.optional(v.string()),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const now = Date.now();
    const existing = await ctx.db
      .query("researchPhaseStates")
      .withIndex("by_run_phase", (q) =>
        q.eq("runId", args.runId).eq("phase", args.phase),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("researchPhaseStates", existing._id, {
        status: args.status,
        output: args.output ?? existing.output,
        sdkSessionId: args.sdkSessionId ?? existing.sdkSessionId,
        costUsd: args.costUsd ?? existing.costUsd,
        updatedAt: now,
      });
      const updated = await ctx.db.get("researchPhaseStates", existing._id);
      return researchPhaseRecord(updated!);
    }
    const id = await ctx.db.insert("researchPhaseStates", {
      runId: args.runId,
      phase: args.phase,
      status: args.status,
      output: args.output,
      sdkSessionId: args.sdkSessionId,
      costUsd: args.costUsd,
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await ctx.db.get("researchPhaseStates", id);
    return researchPhaseRecord(inserted!);
  },
});

export const listResearchPhases = query({
  args: { serviceToken: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const docs = await ctx.db
      .query("researchPhaseStates")
      .withIndex("by_run_phase", (q) => q.eq("runId", args.runId))
      .take(20);
    return docs.map(researchPhaseRecord);
  },
});

// ── context data (artifacts / manifests / RAG) ──────────────────────────────

type ArtifactSnapshot = {
  artifactId: string;
  title: string;
  artifactType?: string;
  text: string;
  workspaceId?: string;
};

async function artifactSnapshot(
  ctx: QueryCtx,
  artifactId: Id<"artifacts">,
  expectedOwner?: string,
): Promise<ArtifactSnapshot | null> {
  const artifact = await ctx.db.get("artifacts", artifactId);
  if (
    !artifact ||
    artifact.status === "deleted" ||
    (expectedOwner && artifact.ownerUserId !== expectedOwner)
  ) {
    return null;
  }
  const content = await ctx.db
    .query("artifactContents")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", artifact.ownerUserId).eq("artifactId", artifact._id),
    )
    .unique();
  const text =
    content?.contextText?.trim() ||
    content?.plainText?.trim() ||
    content?.markdown?.trim() ||
    "";
  return {
    artifactId: String(artifact._id),
    title: artifact.title,
    artifactType: artifact.artifactType,
    text,
    workspaceId: artifact.workspaceId ? String(artifact.workspaceId) : undefined,
  };
}

export const listContextArtifacts = query({
  args: {
    serviceToken: v.string(),
    threadId: v.string(),
    artifactIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const thread = await requireThread(ctx, args.threadId);
    const ids = args.artifactIds
      .slice(0, MAX_CONTEXT_ARTIFACTS)
      .map((raw) => ctx.db.normalizeId("artifacts", raw))
      .filter((id): id is Id<"artifacts"> => id !== null);
    const snapshots = await Promise.all(
      ids.map((id) => artifactSnapshot(ctx, id, thread.ownerUserId)),
    );
    return snapshots.filter((snapshot) => snapshot !== null);
  },
});

export const getArtifact = query({
  args: { serviceToken: v.string(), artifactId: v.string() },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const id = ctx.db.normalizeId("artifacts", args.artifactId);
    return id ? await artifactSnapshot(ctx, id) : null;
  },
});

export const getWorkspaceManifests = query({
  args: {
    serviceToken: v.string(),
    ownerUserId: v.string(),
    workspaceIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const manifests = await Promise.all(
      args.workspaceIds.map(async (raw) => {
        const workspaceId = ctx.db.normalizeId("workspaces", raw);
        const workspace = workspaceId
          ? await ctx.db.get("workspaces", workspaceId)
          : null;
        if (!workspace || workspace.ownerUserId !== args.ownerUserId) {
          return null;
        }
        const items = await ctx.db
          .query("artifacts")
          .withIndex("by_owner_workspace_status_updated", (q) =>
            q
              .eq("ownerUserId", args.ownerUserId)
              .eq("workspaceId", workspace._id)
              .eq("status", "active"),
          )
          .order("desc")
          .take(MAX_MANIFEST_ITEMS);
        return {
          workspaceId: String(workspace._id),
          name: workspace.name,
          items: items.map((item) => ({
            artifactId: String(item._id),
            title: item.title,
          })),
        };
      }),
    );
    return manifests.filter((manifest) => manifest !== null);
  },
});

// Internal lookup used by the search action below (actions have no db access).
export const threadOwnerInternal = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await findThread(ctx, args.threadId);
    return thread ? { ownerUserId: thread.ownerUserId } : null;
  },
});

export const searchThreadDocuments = action({
  args: { serviceToken: v.string(), threadId: v.string(), query: v.string() },
  handler: async (ctx, args): Promise<string> => {
    requireServiceToken(args.serviceToken);
    const owner: { ownerUserId: string } | null = await ctx.runQuery(
      internal.agent.service.threadOwnerInternal,
      { threadId: args.threadId },
    );
    if (!owner) {
      return "";
    }
    // Delegates to the Convex-owned RAG pipeline (plan §3: RAG does not move).
    return await ctx.runAction(
      internal.agent.context.ragContext.searchThreadDocuments,
      {
        ownerUserId: owner.ownerUserId,
        threadId: args.threadId,
        query: args.query,
      },
    );
  },
});

// ── HITL writes (artifact / workspace actions) ──────────────────────────────

function failureReason(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) {
      return data.message;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
  }
  return "Action failed";
}

const GENERATED_ARTIFACT_TYPES = new Set([
  "markdown",
  "plain_text",
  "html",
  "svg",
  "mermaid",
  "json",
  "csv",
  "code",
]);

export const applyArtifactAction = mutation({
  args: {
    serviceToken: v.string(),
    ownerUserId: v.string(),
    threadId: v.string(),
    action: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    artifactId: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    title: v.optional(v.string()),
    artifactType: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    try {
      if (args.action === "delete") {
        const artifactId = ctx.db.normalizeId("artifacts", args.artifactId ?? "");
        if (!artifactId) {
          return { ok: false, reason: "Artifact not found" };
        }
        await ctx.runMutation(internal.artifacts.deleteArtifactFromAgentInternal, {
          ownerUserId: args.ownerUserId,
          artifactId,
        });
        return { ok: true, artifactId: String(artifactId) };
      }

      const rawType = args.artifactType ?? "markdown";
      const artifactType = (
        GENERATED_ARTIFACT_TYPES.has(rawType) ? rawType : "markdown"
      ) as "markdown";
      const content = args.content ?? "";
      const plainText =
        artifactType === "markdown" ? plainTextFromMarkdown(content) : content;

      if (args.action === "update") {
        const artifactId = ctx.db.normalizeId("artifacts", args.artifactId ?? "");
        if (!artifactId) {
          return { ok: false, reason: "Artifact not found" };
        }
        await ctx.runMutation(internal.artifacts.updateArtifactFromAgentInternal, {
          ownerUserId: args.ownerUserId,
          artifactId,
          title: args.title,
          artifactType,
          content,
          plainText,
        });
        return { ok: true, artifactId: String(artifactId) };
      }

      // create: resolve target workspace — explicit arg, then the thread's
      // filed workspace, then the owner's default workspace.
      let workspaceId = args.workspaceId
        ? ctx.db.normalizeId("workspaces", args.workspaceId)
        : null;
      if (!workspaceId) {
        const thread = await findThread(ctx, args.threadId);
        workspaceId = thread?.workspaceId ?? null;
      }
      if (!workspaceId) {
        workspaceId = await ensureDefaultWorkspaceForOwner(ctx, args.ownerUserId);
      }
      const artifactId: Id<"artifacts"> = await ctx.runMutation(
        internal.artifacts.createArtifactFromAgentInternal,
        {
          ownerUserId: args.ownerUserId,
          workspaceId,
          title: args.title ?? "Artifact",
          artifactType,
          content,
          plainText,
        },
      );
      // Link the artifact to its originating thread so the per-thread artifact
      // panel fills on the sdk backend (plan §9.4 Step 3). `artifacts.threadId`
      // is a plain string column, so the v2 `thr_*` id fits as-is.
      await ctx.db.patch("artifacts", artifactId, { threadId: args.threadId });
      return { ok: true, artifactId: String(artifactId) };
    } catch (error) {
      return { ok: false, reason: failureReason(error) };
    }
  },
});

export const applyWorkspaceAction = mutation({
  args: {
    serviceToken: v.string(),
    ownerUserId: v.string(),
    action: v.union(v.literal("create"), v.literal("rename")),
    name: v.optional(v.string()),
    emoji: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    try {
      if (args.action === "create") {
        const workspaceId: Id<"workspaces"> = await ctx.runMutation(
          internal.workspaces.createFromAgentInternal,
          { ownerUserId: args.ownerUserId, name: args.name ?? "Workspace" },
        );
        return { ok: true, workspaceId: String(workspaceId) };
      }
      const workspaceId = ctx.db.normalizeId("workspaces", args.workspaceId ?? "");
      if (!workspaceId) {
        return { ok: false, reason: "Workspace not found" };
      }
      await ctx.runMutation(internal.workspaces.renameFromAgentInternal, {
        ownerUserId: args.ownerUserId,
        workspaceId,
        name: args.name ?? "",
      });
      return { ok: true, workspaceId: String(workspaceId) };
    } catch (error) {
      return { ok: false, reason: failureReason(error) };
    }
  },
});
