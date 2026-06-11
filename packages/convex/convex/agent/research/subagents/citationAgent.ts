import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { internalAction } from "../../../_generated/server";
import { subagentBaseArgs, subagentStatusValidator, type SubagentStatus } from "./contracts";

// Pre-writer citation verification (Slice R1c). Runs the Phase-2A citation
// integrity engine over the run's accepted sources so the writerAgent can hedge
// flagged sources, and the persisted integrityStatus drives the verification
// panel. Non-fatal by construction: a failure (or rate-limit) leaves integrity
// unset and writes a verification_incomplete marker — the report still ships.

const SUBAGENT = "citation";

export const citationAgent = internalAction({
  args: {
    ...subagentBaseArgs,
  },
  returns: v.object({
    status: subagentStatusValidator,
    verified: v.number(),
    total: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ status: SubagentStatus; verified: number; total: number }> => {
    await ctx.runMutation(internal.agent.research.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "citationVerify",
      eventType: "citation_check",
      title: "Citation integrity",
      summary: "Memverifikasi integritas sitasi sebelum penulisan",
    });
    // Slice R4: this step delegates the fixed citation-verification recipe — record
    // its activation (provenance) without polluting sibling subagent contexts.
    const skill = await ctx.runQuery(internal.agent.skills.skills.getActivatable, {
      ownerUserId: args.ownerUserId,
      name: "citation-verification",
    });
    if (skill) {
      await ctx.runMutation(internal.agent.skills.skills.recordActivation, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        skillId: skill.skillId,
        skillName: skill.name,
        skillVersion: skill.version,
        activatedBy: "model",
      });
    }
    try {
      const result: { verified: number; total: number; rateLimited: boolean } =
        await ctx.runAction(
          internal.agent.research.citationIntegrity.verifyCitationsForRun,
          {
            ownerUserId: args.ownerUserId,
            threadId: args.threadId,
            runId: args.runId,
          },
        );
      await ctx.runMutation(internal.agent.research.subagents.runState.updateBudget, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        subagent: SUBAGENT,
        delta: { tokens: 200, providerCalls: Math.max(1, result.total) },
      });
      if (result.rateLimited) {
        await ctx.runMutation(internal.agent.research.subagents.runState.setVerificationMarker, {
          runId: args.runId,
          ownerUserId: args.ownerUserId,
          marker: "verification_incomplete",
          reason: "citation_rate_limited",
        });
        return { status: "rate_limited" as const, verified: 0, total: result.total };
      }
      return { status: "ok" as const, verified: result.verified, total: result.total };
    } catch {
      await ctx.runMutation(internal.agent.research.subagents.runState.setVerificationMarker, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        marker: "verification_incomplete",
        reason: "citation_failed",
      });
      return { status: "failed" as const, verified: 0, total: 0 };
    }
  },
});
