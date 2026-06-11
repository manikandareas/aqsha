import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { throwAppError } from "../../lib/appError";

// Provenance writers for the sandbox compute path. Kept in the default Convex
// runtime (mutations) and called from the "use node" runner via ctx.runMutation,
// mirroring how the deep-research path persists provenance from its actions.

export const sandboxTaskKindValidator = v.union(
  v.literal("stat_verification"),
  v.literal("replication"),
  v.literal("meta_analysis"),
  v.literal("custom_analysis"),
);

export const sandboxStatusValidator = v.union(
  v.literal("provisioning"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("timeout"),
);

export const checkKindValidator = v.union(
  v.literal("statcheck"),
  v.literal("grim"),
  v.literal("grimmer"),
  v.literal("power"),
);

export const computationOutcomeValidator = v.union(
  v.literal("consistent"),
  v.literal("discrepant"),
  v.literal("decision_error"),
  v.literal("not_computable"),
);

const computationCheckInputValidator = v.object({
  checkKind: checkKindValidator,
  claimText: v.string(),
  claimSpan: v.optional(v.string()),
  reportedJson: v.string(),
  recomputedJson: v.string(),
  outcome: computationOutcomeValidator,
  toleranceJson: v.string(),
});

async function assertSandboxRunOwner(
  ctx: MutationCtx,
  sandboxRunId: Id<"sandboxRuns">,
  ownerUserId: string,
) {
  const run = await ctx.db.get("sandboxRuns", sandboxRunId);
  if (!run || run.ownerUserId !== ownerUserId) {
    throwAppError({
      code: "sandbox_run_not_found",
      message: "Sandbox run tidak ditemukan.",
      severity: "error",
    });
  }
  return run;
}

async function assertAgentRunOwner(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  ownerUserId: string,
) {
  const run = await ctx.db.get("agentRuns", runId);
  if (!run || run.ownerUserId !== ownerUserId) {
    throwAppError({
      code: "agent_run_not_found",
      message: "Agent run tidak ditemukan.",
      severity: "error",
    });
  }
  return run;
}

export const startSandboxRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    taskKind: sandboxTaskKindValidator,
    snapshotVersion: v.string(),
    command: v.string(),
    inputFileHashes: v.array(v.string()),
    creditsCharged: v.optional(v.number()),
  },
  returns: v.id("sandboxRuns"),
  handler: async (ctx, args): Promise<Id<"sandboxRuns">> => {
    const now = Date.now();
    return await ctx.db.insert("sandboxRuns", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      taskKind: args.taskKind,
      status: "provisioning",
      snapshotVersion: args.snapshotVersion,
      command: args.command,
      inputFileHashes: args.inputFileHashes,
      creditsCharged: args.creditsCharged,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const completeSandboxRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    sandboxRunId: v.id("sandboxRuns"),
    status: sandboxStatusValidator,
    exitCode: v.optional(v.number()),
    stdoutClipped: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    outputArtifactIds: v.optional(v.array(v.id("artifacts"))),
    durationMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertSandboxRunOwner(ctx, args.sandboxRunId, args.ownerUserId);
    const now = Date.now();
    await ctx.db.patch("sandboxRuns", args.sandboxRunId, {
      status: args.status,
      exitCode: args.exitCode,
      stdoutClipped: args.stdoutClipped,
      errorMessage: args.errorMessage,
      outputArtifactIds: args.outputArtifactIds,
      durationMs: args.durationMs,
      updatedAt: now,
      completedAt: now,
    });
    return null;
  },
});

export const insertComputationChecks = internalMutation({
  args: {
    ownerUserId: v.string(),
    sandboxRunId: v.id("sandboxRuns"),
    artifactId: v.id("artifacts"),
    checks: v.array(computationCheckInputValidator),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    await assertSandboxRunOwner(ctx, args.sandboxRunId, args.ownerUserId);
    const now = Date.now();
    await Promise.all(
      args.checks.map((check) =>
        ctx.db.insert("computationChecks", {
          ownerUserId: args.ownerUserId,
          sandboxRunId: args.sandboxRunId,
          artifactId: args.artifactId,
          checkKind: check.checkKind,
          claimText: check.claimText,
          claimSpan: check.claimSpan,
          reportedJson: check.reportedJson,
          recomputedJson: check.recomputedJson,
          outcome: check.outcome,
          toleranceJson: check.toleranceJson,
          createdAt: now,
        }),
      ),
    );
    return args.checks.length;
  },
});

export const persistVerificationReport = internalMutation({
  args: {
    ownerUserId: v.string(),
    runId: v.id("agentRuns"),
    verificationReportJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertAgentRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.patch("agentRuns", args.runId, {
      verificationReportJson: args.verificationReportJson,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordComputeEvent = internalMutation({
  args: {
    ownerUserId: v.string(),
    runId: v.id("agentRuns"),
    threadId: v.string(),
    title: v.string(),
    summary: v.string(),
    metadataJson: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertAgentRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.insert("agentRunEvents", {
      ownerUserId: args.ownerUserId,
      runId: args.runId,
      threadId: args.threadId,
      eventType: "compute",
      title: args.title,
      summary: args.summary,
      metadataJson: args.metadataJson,
      createdAt: Date.now(),
    });
    return null;
  },
});
