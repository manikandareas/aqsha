import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { internalAction } from "../../../_generated/server";
import { throwAppError } from "../../../lib/appError";
import {
  buildRoundLoopStateFromRehydrated,
  normalizePlan,
  planSourceBuckets,
  runCounterEvidence,
  type RoundAgentArgs,
} from "../deepResearch";
import type { SourceBucket } from "../deepResearch";
import { rehydrateLoopState } from "./loopState";
import { subagentBaseArgs, subagentStatusValidator } from "./contracts";

// The counter-evidence pass as a standalone workflow step (Slice R1b), run once
// after the literature rounds in the v2 path. Rehydrates the accumulated state,
// runs the shared runCounterEvidence (which decides whether a counter pass is
// warranted and persists any new sources), folds a budget estimate, returns a
// status. Non-fatal by construction — a failure degrades the report, never the run.

const SUBAGENT = "counterEvidence";

export const counterEvidenceAgent = internalAction({
  args: {
    ...subagentBaseArgs,
    prompt: v.string(),
    plan: v.any(),
  },
  returns: v.object({
    status: subagentStatusValidator,
    sourceCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.agent.research.deepResearch.getInternalRun, {
      runId: args.runId,
    });
    if (!run || run.ownerUserId !== args.ownerUserId) {
      throwAppError({
        code: "agent_run_not_found",
        message: "Agent run tidak ditemukan.",
        severity: "error",
      });
      throw new Error("unreachable");
    }
    const plan = normalizePlan(args.plan, args.agentKind);
    const buckets: SourceBucket[] = run.bucketsJson
      ? (JSON.parse(run.bucketsJson) as SourceBucket[])
      : await planSourceBuckets(ctx, args.prompt, plan);

    const [sourceState, extracts, snapshot] = await Promise.all([
      ctx.runQuery(internal.agent.research.subagents.runState.listRunSourceState, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
      }),
      ctx.runQuery(internal.agent.research.subagents.runState.listExtractsForRun, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
      }),
      ctx.runQuery(internal.agent.research.subagents.runState.getLatestRoundSnapshot, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
      }),
    ]);
    const rehydrated = rehydrateLoopState({
      acceptedSources: sourceState.accepted,
      rejectedKeys: sourceState.rejectedKeys,
      rejectedSources: sourceState.rejected,
      extracts,
      snapshot,
      initialGapAssessment: `Initial plan: ${plan.sufficiencyCriteria.join("; ")}`,
    });
    const state = buildRoundLoopStateFromRehydrated(buckets, rehydrated);

    const roundArgs: RoundAgentArgs = {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      prompt: args.prompt,
      agentKind: args.agentKind,
    };
    try {
      await runCounterEvidence(ctx, roundArgs, state);
    } catch {
      // Non-fatal: the counter-evidence pass is best-effort. Mark the step done so
      // the workflow proceeds to synthesis with whatever evidence exists.
      await ctx.runMutation(internal.agent.research.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "runCounterEvidencePass",
        status: "completed",
        summary: "Counter-evidence dilewati (gagal, non-fatal)",
      });
      return { status: "failed" as const, sourceCount: state.acceptedByKey.size };
    }

    await ctx.runMutation(internal.agent.research.subagents.runState.updateBudget, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      subagent: SUBAGENT,
      delta: { tokens: 800, providerCalls: 1 },
    });
    return { status: "ok" as const, sourceCount: state.acceptedByKey.size };
  },
});
