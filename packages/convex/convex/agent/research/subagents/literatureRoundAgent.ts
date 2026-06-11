import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { internalAction } from "../../../_generated/server";
import { throwAppError } from "../../../lib/appError";
import {
  buildRoundLoopStateFromRehydrated,
  normalizePlan,
  planSourceBuckets,
  runResearchRound,
  type RoundAgentArgs,
} from "../deepResearch";
import type { SourceBucket } from "../deepResearch";
import { rehydrateLoopState } from "./loopState";
import { subagentBaseArgs } from "./contracts";

// One decomposed literature round (Slice R1b). Runs as its own workflow step so
// the v2 deep-research loop is a sequence of `step.runAction(literatureRoundAgent)`
// calls instead of one monolithic researchLoop action. Each invocation rehydrates
// the cross-round state from persisted rows, runs exactly one round (which persists
// its own deltas via the shared runResearchRound), folds a budget estimate, and
// returns only scalars — no bulk payload crosses the step boundary.

const SUBAGENT = "literatureRound";

export const literatureRoundAgent = internalAction({
  args: {
    ...subagentBaseArgs,
    prompt: v.string(),
    plan: v.any(),
    round: v.number(),
    maxRounds: v.number(),
  },
  returns: v.object({
    stop: v.boolean(),
    ready: v.boolean(),
    sourceCount: v.number(),
    extractCount: v.number(),
    sufficiencyStatus: v.string(),
    gapAssessment: v.string(),
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

    // Buckets are planned once per run and persisted; round 1 plans + persists,
    // later rounds read back (no re-planning).
    let buckets: SourceBucket[];
    if (run.bucketsJson) {
      buckets = JSON.parse(run.bucketsJson) as SourceBucket[];
    } else {
      buckets = await planSourceBuckets(ctx, args.prompt, plan);
      await ctx.runMutation(internal.agent.research.deepResearch.persistRunBuckets, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        bucketsJson: JSON.stringify(buckets),
      });
    }

    // Rehydrate the cross-round accumulation from persisted rows.
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
    const result = await runResearchRound(ctx, roundArgs, plan, state, args.round, args.maxRounds);

    // Budget fold. The round's deep-model calls (query selection, sufficiency,
    // extract quoting) don't surface exact token usage here, so record a per-round
    // estimate proportional to the evidence handled. Keeps the per-subagent
    // envelope > 0 (AUD-12 reconciliation basis) without claiming false precision.
    const tokenEstimate = 1_500 + state.acceptedByKey.size * 200 + state.extractsByKey.size * 150;
    await ctx.runMutation(internal.agent.research.subagents.runState.updateBudget, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      subagent: SUBAGENT,
      delta: { tokens: tokenEstimate, providerCalls: 1 },
    });

    return {
      stop: result.stop,
      ready: result.ready,
      sourceCount: state.acceptedByKey.size,
      extractCount: state.extractsByKey.size,
      sufficiencyStatus: state.sufficiencyStatus,
      gapAssessment: state.gapAssessment,
    };
  },
});
