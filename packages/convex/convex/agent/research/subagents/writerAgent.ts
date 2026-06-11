import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { internalAction, type ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { throwAppError } from "../../../lib/appError";
import {
  generateSynthesis,
  normalizePlan,
  type ResearchExtract,
} from "../deepResearch";
import type { SourceCandidate } from "../sourceCandidates";
import { subagentBaseArgs } from "./contracts";
import { appendVerificationCaveat } from "./runState";
import { selectDomainPack } from "./skillDelegation";

// Report writer (Slice R1c). Replaces the monolithic synthesize step in the v2
// path: rebuilds the synthesis inputs from persisted rows, folds in the citation
// integrity summary, generates the report + chat summary, and STAGES the markdown
// on the run (agentRuns.draftMarkdown) so the auditor/finalizer read it back by
// runId instead of journaling the full report between steps.

const SUBAGENT = "writer";

// Resolve, load, and record the writer's delegated domain methodology pack.
// Returns the pack body to inject, or undefined when no pack matches / is enabled.
async function resolveWriterSkill(
  ctx: ActionCtx,
  args: { ownerUserId: string; threadId: string; runId: Id<"agentRuns">; prompt: string },
): Promise<string | undefined> {
  const catalog: Array<{ name: string; description: string }> = await ctx.runQuery(
    internal.agent.skills.skills.listCatalog,
    { ownerUserId: args.ownerUserId },
  );
  const packName = selectDomainPack(args.prompt, catalog);
  if (!packName) return undefined;
  const skill = await ctx.runQuery(internal.agent.skills.skills.getActivatable, {
    ownerUserId: args.ownerUserId,
    name: packName,
  });
  if (!skill) return undefined;
  await ctx.runMutation(internal.agent.skills.skills.recordActivation, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    runId: args.runId,
    skillId: skill.skillId,
    skillName: skill.name,
    skillVersion: skill.version,
    activatedBy: "model",
  });
  return skill.bodyText;
}

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

    // Slice R4: resolve THIS step's domain methodology pack (writer only) and inject
    // its body into the synthesis prompt; record the activation with the step key so
    // the report can cite which methodology version was applied. Sibling subagents
    // never see this pack — delegation keeps each context lean.
    const skillContent = await resolveWriterSkill(ctx, args);

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
      skillContent,
    });

    if (!out.markdown.trim()) {
      throwAppError({
        code: "writer_empty",
        message: "Writer menghasilkan laporan kosong.",
        severity: "error",
      });
    }
    // Slice R1d: if a non-fatal verifier (citation, …) degraded before the writer,
    // append a visible "verification incomplete" caveat so the report is honest
    // about partial verification (the run still ships).
    const markers = await ctx.runQuery(
      internal.agent.research.subagents.runState.getVerificationMarkers,
      { runId: args.runId, ownerUserId: args.ownerUserId },
    );
    const staged = appendVerificationCaveat(out.markdown, markers);
    await ctx.runMutation(internal.agent.research.subagents.runState.setRunDraftMarkdown, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      markdown: staged,
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
