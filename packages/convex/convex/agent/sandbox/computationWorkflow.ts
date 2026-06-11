import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { throwAppError } from "../../lib/appError";
import { researchWorkflow } from "../workflow";
import { sandboxTaskKindValidator } from "./records";

// Durable long-job path for sandbox compute, mirroring deepResearchExecuteWorkflow
// (agent/research/deepResearch.ts) + the shared WorkflowManager (agent/workflow.ts).
// It hydrates the artifact text in a retryable step, then runs the verification.
// Teardown is guaranteed by the vendor's `finally` inside the runner. This is the
// activation point for jobs that need durability (survive the inline action
// limit) — runComputation executes stat_verification inline today since those
// jobs are bounded ≤90s; replication/meta-analysis remain tier-gated until the
// Daytona tier grants sandbox egress.

// Retries are read-only-safe only. The hydrate step (a pure read) retries on
// transient errors; the execute step is NOT retried because it consumes a
// non-idempotent sandbox_compute credit (a retry would double-charge). The
// runner already catches its own failures and records them, so a failed run
// resolves cleanly without a throw.
const HYDRATE_RETRY = { maxAttempts: 3, initialBackoffMs: 2_000, base: 2 };

export const sandboxComputeWorkflow = researchWorkflow.define({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    artifactId: v.id("artifacts"),
    taskKind: sandboxTaskKindValidator,
  },
  handler: async (step, args): Promise<void> => {
    const text = await step.runAction(
      internal.agent.sandbox.artifactText.resolveArtifactTextAction,
      { ownerUserId: args.ownerUserId, artifactId: args.artifactId },
      { retry: HYDRATE_RETRY },
    );
    if (!text.trim()) return;
    await step.runAction(
      internal.agent.sandbox.sandboxRunner.runStatVerification,
      {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        artifactId: args.artifactId,
        text,
      },
    );
  },
});

export const startSandboxComputeWorkflow = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    artifactId: v.id("artifacts"),
    taskKind: sandboxTaskKindValidator,
  },
  returns: v.object({ workflowId: v.string() }),
  handler: async (ctx, args): Promise<{ workflowId: string }> => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId) {
      throwAppError({
        code: "agent_run_not_found",
        message: "Agent run tidak ditemukan.",
        severity: "error",
      });
    }
    const workflowId = await researchWorkflow.start(
      ctx,
      internal.agent.sandbox.computationWorkflow.sandboxComputeWorkflow,
      args,
      { context: { runId: args.runId, ownerUserId: args.ownerUserId } },
    );
    return { workflowId: String(workflowId) };
  },
});
