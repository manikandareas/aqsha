import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { internalAction } from "../../../_generated/server";
import { throwAppError } from "../../../lib/appError";
import {
  generateSynthesis,
  normalizePlan,
  type ResearchExtract,
} from "../deepResearch";
import type { SourceCandidate } from "../sourceCandidates";
import { subagentBaseArgs } from "./contracts";

// Report writer (Slice R1c). Replaces the monolithic synthesize step in the v2
// path: rebuilds the synthesis inputs from persisted rows, folds in the citation
// integrity summary, generates the report + chat summary, and STAGES the markdown
// on the run (agentRuns.draftMarkdown) so the auditor/finalizer read it back by
// runId instead of journaling the full report between steps.

const SUBAGENT = "writer";

export const writerAgent = internalAction({
  args: {
    ...subagentBaseArgs,
    prompt: v.string(),
    plan: v.any(),
  },
  returns: v.object({
    chatSummary: v.string(),
    summary: v.string(),
    ready: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ chatSummary: string; summary: string; ready: boolean }> => {
    await ctx.runMutation(internal.agent.research.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "synthesize",
      status: "running",
    });
    const evidence: {
      sources: SourceCandidate[];
      extracts: ResearchExtract[];
      roundState: Array<{
        round: number;
        query: string;
        gapAssessment: string;
        sufficiencyStatus: string;
      }>;
    } = await ctx.runQuery(internal.agent.research.deepResearch.loadRunEvidence, {
      ownerUserId: args.ownerUserId,
      runId: args.runId,
    });
    const integrity: { note: string; flaggedCount: number; verifiedCount: number } =
      await ctx.runQuery(internal.agent.research.deepResearch.getRunIntegritySummary, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
      });

    const out = await generateSynthesis({
      prompt: args.prompt,
      plan: normalizePlan(args.plan, args.agentKind),
      sources: evidence.sources,
      // roundState shape from loadRunEvidence is the lightweight trace; generateSynthesis
      // only stringifies it for context, so the minimal fields are sufficient.
      extracts: evidence.extracts,
      roundState: evidence.roundState as never,
      agentKind: args.agentKind,
      integrityNote: integrity.note || undefined,
    });

    if (!out.markdown.trim()) {
      throwAppError({
        code: "writer_empty",
        message: "Writer menghasilkan laporan kosong.",
        severity: "error",
      });
    }
    await ctx.runMutation(internal.agent.research.subagents.runState.setRunDraftMarkdown, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      markdown: out.markdown,
    });
    await ctx.runMutation(internal.agent.research.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "synthesize",
      status: "completed",
      summary: out.readiness.ready ? "Laporan markdown tersusun" : `Artifact parsial tersusun: ${out.readiness.recommendation}`,
    });
    await ctx.runMutation(internal.agent.research.subagents.runState.updateBudget, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      subagent: SUBAGENT,
      delta: { tokens: 4_000, providerCalls: 1 },
    });
    return { chatSummary: out.chatSummary, summary: out.summary, ready: out.readiness.ready };
  },
});
