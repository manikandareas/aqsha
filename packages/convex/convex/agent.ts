import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireCurrentUser } from "./auth";
import { throwAppError } from "./lib/appError";
import { checkAndConsumeSendQuota } from "./agent/sendQuota";
import {
  bumpThreadOnMessage,
  findRun,
  findThread,
  messageRecord,
  requireRun,
} from "./agent/service/model";

// Public entrypoints for the SDK agent backend (plan §4.1 / §9.4 Step 1):
// startThread/sendMessage validate + gate (same rate-limit/billing semantics
// as the legacy backend via checkAndConsumeSendQuota), persist the user
// message + queued run in the first-party tables, then hand execution to
// apps/agents over HTTP (POST /runs) via a scheduled action.

const agentKindValidator = v.union(v.literal("lite"), v.literal("pro"));

const MAX_PROMPT_LENGTH = 32_000;

const startResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    threadId: v.string(),
    messageId: v.string(),
    runId: v.string(),
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
    requiredPlan: v.optional(
      v.union(v.literal("free"), v.literal("starter"), v.literal("plus")),
    ),
    creditsRemaining: v.optional(v.number()),
  }),
);

type StartFailure = {
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

function normalizePrompt(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throwAppError({
      message: "Message cannot be empty",
      code: "message_empty",
      field: "content",
      severity: "warning",
    });
  }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throwAppError({
      message: "Message is too long",
      code: "message_too_long",
      field: "content",
      severity: "warning",
    });
  }
  return trimmed;
}

type GateResult = Awaited<ReturnType<typeof checkAndConsumeSendQuota>>;

function gateFailure(gate: Extract<GateResult, { ok: false }>): StartFailure {
  if (gate.entitlement) {
    return {
      ok: false,
      reason: gate.entitlement.reason,
      resetAt: gate.entitlement.resetAt,
      requiredPlan: gate.entitlement.requiredPlan,
      creditsRemaining: gate.entitlement.creditsRemaining,
    };
  }
  return { ok: false, reason: "rate_limited", retryAt: gate.retryAt };
}

type DispatchPayload = {
  runId: string;
  threadId: string;
  ownerUserId: string;
  agentKind: "lite" | "pro";
  mode: "normal" | "deep";
  prompt: string;
  promptMessageId?: string;
  contextRefs: { artifactIds: string[]; workspaceIds: string[] };
};

async function persistTurnAndDispatch(
  ctx: MutationCtx,
  input: {
    ownerUserId: string;
    threadId: string;
    agentKind: "lite" | "pro";
    prompt: string;
    contextArtifactIds: string[];
    contextWorkspaceIds: string[];
  },
): Promise<{ ok: true; threadId: string; messageId: string; runId: string }> {
  const thread = await findThread(ctx, input.threadId);
  if (!thread) {
    throwAppError({ message: "Thread not found", code: "thread_not_found" });
  }
  const now = Date.now();
  const messageDocId = await ctx.db.insert("chatMessages", {
    threadId: input.threadId,
    ownerUserId: input.ownerUserId,
    role: "user",
    text: input.prompt,
    status: "complete",
    createdAt: now,
  });
  await bumpThreadOnMessage(ctx, thread, { text: input.prompt, countDelta: 1 });

  const runId = `run_${crypto.randomUUID()}`;
  const isDeep = input.prompt.startsWith("/deep");
  await ctx.db.insert("agentRuns", {
    runId,
    threadId: input.threadId,
    ownerUserId: input.ownerUserId,
    agentKind: input.agentKind,
    mode: isDeep ? "deep" : "normal",
    promptMessageId: String(messageDocId),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch("chatMessages", messageDocId, { runId });

  const payload: DispatchPayload = {
    runId,
    threadId: input.threadId,
    ownerUserId: input.ownerUserId,
    agentKind: input.agentKind,
    mode: isDeep ? "deep" : "normal",
    prompt: input.prompt,
    promptMessageId: String(messageDocId),
    contextRefs: {
      artifactIds: input.contextArtifactIds,
      workspaceIds: input.contextWorkspaceIds,
    },
  };
  await ctx.scheduler.runAfter(0, internal.agent.dispatchRun, payload);
  return {
    ok: true,
    threadId: input.threadId,
    messageId: String(messageDocId),
    runId,
  };
}

async function hasActiveRun(ctx: MutationCtx, threadId: string): Promise<boolean> {
  const recent = await ctx.db
    .query("agentRuns")
    .withIndex("by_thread_created", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(10);
  return recent.some((run) =>
    ["queued", "running", "waiting", "waiting_hitl"].includes(run.status),
  );
}

export const startThread = mutation({
  args: {
    content: v.string(),
    agentKind: agentKindValidator,
    workspaceId: v.optional(v.id("workspaces")),
    contextArtifactIds: v.optional(v.array(v.string())),
    contextWorkspaceIds: v.optional(v.array(v.string())),
  },
  returns: startResultValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const prompt = normalizePrompt(args.content);
    const gate = await checkAndConsumeSendQuota(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      content: prompt,
      agentKind: args.agentKind,
      isDeep: prompt.startsWith("/deep"),
    });
    if (!gate.ok) {
      return gateFailure(gate);
    }
    if (args.workspaceId) {
      const workspace = await ctx.db.get("workspaces", args.workspaceId);
      if (!workspace || workspace.ownerUserId !== user._id) {
        throwAppError({
          message: "Workspace not found",
          code: "workspace_not_found",
        });
      }
    }
    const threadId = `thr_${crypto.randomUUID()}`;
    await ctx.db.insert("chatThreads", {
      threadId,
      ownerUserId: user._id,
      agentKind: args.agentKind,
      workspaceId: args.workspaceId,
      status: "idle",
      lastActivityAt: Date.now(),
      messageCount: 0,
    });
    return await persistTurnAndDispatch(ctx, {
      ownerUserId: user._id,
      threadId,
      agentKind: args.agentKind,
      prompt,
      contextArtifactIds: args.contextArtifactIds ?? [],
      contextWorkspaceIds: args.contextWorkspaceIds ?? [],
    });
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
    contextArtifactIds: v.optional(v.array(v.string())),
    contextWorkspaceIds: v.optional(v.array(v.string())),
  },
  returns: startResultValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const prompt = normalizePrompt(args.content);
    const thread = await findThread(ctx, args.threadId);
    if (!thread || thread.ownerUserId !== user._id) {
      throwAppError({ message: "Thread not found", code: "thread_not_found" });
    }
    if (await hasActiveRun(ctx, args.threadId)) {
      return { ok: false as const, reason: "reply_in_progress" as const };
    }
    const gate = await checkAndConsumeSendQuota(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      content: prompt,
      agentKind: thread.agentKind,
      isDeep: prompt.startsWith("/deep"),
    });
    if (!gate.ok) {
      return gateFailure(gate);
    }
    return await persistTurnAndDispatch(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
      agentKind: thread.agentKind,
      prompt,
      contextArtifactIds: args.contextArtifactIds ?? [],
      contextWorkspaceIds: args.contextWorkspaceIds ?? [],
    });
  },
});

export const cancelRun = mutation({
  args: { runId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const run = await requireRun(ctx, args.runId);
    if (run.ownerUserId !== user._id) {
      throwAppError({ message: "Run not found", code: "run_not_found" });
    }
    if (["completed", "failed", "canceled"].includes(run.status)) {
      return { ok: true };
    }
    // Durable cancel (plan §9.4 Step 3): Convex is the source of truth, so the
    // run flips to canceled HERE first — the service forward is best-effort
    // and the agent/service finalize guards keep `canceled` sticky even when
    // the still-streaming service later reports completed/failed.
    await ctx.db.patch("agentRuns", run._id, {
      status: "canceled",
      updatedAt: Date.now(),
    });
    const thread = await findThread(ctx, run.threadId);
    if (thread) {
      await ctx.db.patch("chatThreads", thread._id, { status: "idle" });
    }
    const streaming = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", run.threadId))
      .order("desc")
      .take(5);
    for (const message of streaming) {
      if (message.runId === run.runId && message.status === "streaming") {
        await ctx.db.patch("chatMessages", message._id, { status: "complete" });
      }
    }
    await ctx.scheduler.runAfter(0, internal.agent.forwardCancel, {
      runId: args.runId,
    });
    return { ok: true };
  },
});

export const retryRun = mutation({
  args: { runId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const run = await requireRun(ctx, args.runId);
    if (run.ownerUserId !== user._id) {
      throwAppError({ message: "Run not found", code: "run_not_found" });
    }
    if (run.status !== "failed") {
      throwAppError({
        message: "Only failed runs can be retried",
        code: "run_not_retryable",
        severity: "info",
      });
    }
    if (await hasActiveRun(ctx, run.threadId)) {
      throwAppError({
        message: "A reply is already in progress",
        code: "reply_in_progress",
        severity: "info",
      });
    }
    // Recover the original prompt from the user message that started the run.
    // No re-gating: the original send already consumed quota/credits.
    let prompt: string | undefined;
    if (run.promptMessageId) {
      const messageId = ctx.db.normalizeId("chatMessages", run.promptMessageId);
      const message = messageId ? await ctx.db.get("chatMessages", messageId) : null;
      prompt = message?.text;
    }
    if (!prompt) {
      const lastUser = await ctx.db
        .query("chatMessages")
        .withIndex("by_thread_created", (q) => q.eq("threadId", run.threadId))
        .order("desc")
        .take(20);
      prompt = lastUser.find((m) => m.role === "user")?.text;
    }
    if (!prompt) {
      throwAppError({
        message: "Original prompt not found for this run",
        code: "run_prompt_missing",
      });
    }
    await ctx.db.patch("agentRuns", run._id, {
      status: "queued",
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    const thread = await findThread(ctx, run.threadId);
    if (thread && thread.status === "failed") {
      await ctx.db.patch("chatThreads", thread._id, { status: "idle" });
    }
    await ctx.scheduler.runAfter(0, internal.agent.dispatchRun, {
      runId: run.runId,
      threadId: run.threadId,
      ownerUserId: run.ownerUserId,
      agentKind: run.agentKind,
      mode: run.mode,
      prompt,
      promptMessageId: run.promptMessageId,
      contextRefs: { artifactIds: [], workspaceIds: [] },
    });
    return { ok: true };
  },
});

export const removeThread = mutation({
  args: { threadId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await findThread(ctx, args.threadId);
    if (!thread || thread.ownerUserId !== user._id) {
      return { ok: true };
    }
    // Bounded cleanup — dev-scale threads; large threads finish on a later
    // call (the thread row goes last so retries keep finding the children).
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .take(500);
    for (const message of messages) {
      await ctx.db.delete("chatMessages", message._id);
    }
    const interactions = await ctx.db
      .query("pendingInteractions")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .take(200);
    for (const interaction of interactions) {
      await ctx.db.delete("pendingInteractions", interaction._id);
    }
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .take(100);
    for (const run of runs) {
      const events = await ctx.db
        .query("agentRunEvents")
        .withIndex("by_run_seq", (q) => q.eq("runId", run.runId))
        .take(500);
      for (const event of events) {
        await ctx.db.delete("agentRunEvents", event._id);
      }
      const phases = await ctx.db
        .query("researchPhaseStates")
        .withIndex("by_run_phase", (q) => q.eq("runId", run.runId))
        .take(20);
      for (const phase of phases) {
        await ctx.db.delete("researchPhaseStates", phase._id);
      }
      await ctx.db.delete("agentRuns", run._id);
    }
    await ctx.db.delete("chatThreads", thread._id);
    return { ok: true };
  },
});

// Composer `/` palette source (plan §5.4): temporary proxy to the service's
// GET /commands registry until deploy-time sync lands. Action (outbound HTTP),
// cached client-side via TanStack staleTime.
export const listCommands = action({
  args: {},
  handler: async (ctx): Promise<
    Array<{
      name: string;
      description: string;
      argumentHint?: string;
      scope: string;
      interceptedByService?: boolean;
    }>
  > => {
    await requireCurrentUser(ctx);
    try {
      const response = await fetch(`${serviceBaseUrl()}/commands`, {
        headers: serviceHeaders(),
      });
      if (!response.ok) {
        return [];
      }
      return (await response.json()) as Array<{
        name: string;
        description: string;
        argumentHint?: string;
        scope: string;
        interceptedByService?: boolean;
      }>;
    } catch {
      return [];
    }
  },
});

// ── service HTTP bridge (internal actions) ──────────────────────────────────

function serviceBaseUrl(): string {
  const url = process.env.AGENTS_SERVICE_URL?.trim();
  if (!url) {
    throw new Error("AGENTS_SERVICE_URL is not configured");
  }
  return url.replace(/\/$/, "");
}

function serviceHeaders(): Record<string, string> {
  const token = process.env.AGENTS_SERVICE_TOKEN?.trim();
  if (!token) {
    throw new Error("AGENTS_SERVICE_TOKEN is not configured");
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
}

const DISPATCH_ATTEMPTS = 3;

export const dispatchRun = internalAction({
  args: {
    runId: v.string(),
    threadId: v.string(),
    ownerUserId: v.string(),
    agentKind: agentKindValidator,
    mode: v.union(v.literal("normal"), v.literal("deep")),
    prompt: v.string(),
    promptMessageId: v.optional(v.string()),
    contextRefs: v.object({
      artifactIds: v.array(v.string()),
      workspaceIds: v.array(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    let lastError = "";
    for (let attempt = 1; attempt <= DISPATCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${serviceBaseUrl()}/runs`, {
          method: "POST",
          headers: serviceHeaders(),
          body: JSON.stringify(args),
        });
        if (response.ok) {
          return null;
        }
        lastError = `service responded ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "fetch failed";
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
    await ctx.runMutation(internal.agent.markDispatchFailed, {
      runId: args.runId,
      message: `Agent service unreachable (${lastError}). Coba kirim ulang.`,
    });
    return null;
  },
});

export const forwardCancel = internalAction({
  args: { runId: v.string() },
  handler: async (_ctx, args) => {
    try {
      await fetch(`${serviceBaseUrl()}/runs/${args.runId}/cancel`, {
        method: "POST",
        headers: serviceHeaders(),
        body: "{}",
      });
    } catch {
      // The watchdog sweep will fail the run if the service never comes back.
    }
    return null;
  },
});

export const markDispatchFailed = internalMutation({
  args: { runId: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const run = await findRun(ctx, args.runId);
    if (!run || !["queued", "running"].includes(run.status)) {
      return null;
    }
    await ctx.db.patch("agentRuns", run._id, {
      status: "failed",
      errorMessage: args.message,
      updatedAt: Date.now(),
    });
    const thread = await findThread(ctx, run.threadId);
    if (thread) {
      await ctx.db.patch("chatThreads", thread._id, { status: "failed" });
    }
    return null;
  },
});

// ── watchdog (plan §4.3): orphaned runs → failed, retryable by the user ─────

const QUEUED_STALL_MS = 5 * 60 * 1000;
const RUNNING_STALL_MS = 10 * 60 * 1000;
const RESUME_RECOVERY_GRACE_MS = 30 * 1000;
const WATCHDOG_BATCH = 25;

export const watchdogSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sweeps: Array<{ status: "queued" | "running" | "waiting"; cutoff: number }> = [
      { status: "queued", cutoff: now - QUEUED_STALL_MS },
      { status: "running", cutoff: now - RUNNING_STALL_MS },
      { status: "waiting", cutoff: now - RUNNING_STALL_MS },
    ];
    for (const sweep of sweeps) {
      const stalled = await ctx.db
        .query("agentRuns")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", sweep.status).lt("updatedAt", sweep.cutoff),
        )
        .take(WATCHDOG_BATCH);
      for (const run of stalled) {
        await ctx.db.patch("agentRuns", run._id, {
          status: "failed",
          errorMessage: "Run terhenti tanpa respons dari agent service. Coba kirim ulang.",
          updatedAt: now,
        });
        const thread = await findThread(ctx, run.threadId);
        if (thread) {
          await ctx.db.patch("chatThreads", thread._id, { status: "failed" });
        }
        const message = run.promptMessageId
          ? null
          : await ctx.db
              .query("chatMessages")
              .withIndex("by_thread_created", (q) => q.eq("threadId", run.threadId))
              .order("desc")
              .first();
        // Close any streaming assistant message left behind by the dead run.
        if (message && message.runId === run.runId && message.status === "streaming") {
          await ctx.db.patch("chatMessages", message._id, { status: "error" });
        }
      }
    }

    // Resume-recovery (plan §9.4 Step 3): a waiting_hitl run whose latest
    // interaction was responded AFTER the run last moved means the resume
    // forward was lost (service restart / unreachable). Re-forward it — the
    // service answers 409 when the run is no longer waiting, so this is
    // idempotent and safe to repeat every sweep until the service recovers.
    const waitingRuns = await ctx.db
      .query("agentRuns")
      .withIndex("by_status_updated", (q) => q.eq("status", "waiting_hitl"))
      .take(WATCHDOG_BATCH);
    for (const run of waitingRuns) {
      const responded = await ctx.db
        .query("pendingInteractions")
        .withIndex("by_run_status", (q) =>
          q.eq("runId", run.runId).eq("status", "responded"),
        )
        .order("desc")
        .take(5);
      const latest = responded.reduce<(typeof responded)[number] | null>(
        (best, doc) =>
          (doc.respondedAt ?? 0) > (best?.respondedAt ?? 0) ? doc : best,
        null,
      );
      // 30s grace: the respond mutation forwards immediately on its own; only
      // re-forward once that first attempt has clearly had time to land.
      if (
        latest &&
        (latest.respondedAt ?? 0) > run.updatedAt &&
        (latest.respondedAt ?? 0) < now - RESUME_RECOVERY_GRACE_MS
      ) {
        await ctx.scheduler.runAfter(0, internal.agent.interactions.forwardResume, {
          runId: run.runId,
          interactionId: String(latest._id),
        });
      }
    }
    return null;
  },
});

// Re-exported helper for tests (message shape parity with the service facade).
export { messageRecord as _messageRecordForTests };
