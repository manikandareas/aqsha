import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { errorResult, jsonResult, type RunToolContext } from "./context";

// Statistical verification tools (plan §5.6). verifyStatistics is read-only
// auto-execute; runComputation is approval-gated via canUseTool. The Daytona
// engine is behind SandboxService (Phase 4 port).

export function buildSandboxTools(ctx: RunToolContext) {
  const verifyStatistics = tool(
    "verifyStatistics",
    "Verify the statistical reporting of a document (statcheck/GRIM/power checks) in a sandbox. Pass the artifactId of the paper in context.",
    { artifactId: z.string().min(1) },
    async (args) => {
      const artifact = await ctx.store.getArtifact(args.artifactId);
      if (!artifact) {
        return errorResult(`Artifact ${args.artifactId} was not found.`);
      }
      const result = await ctx.sandbox.verifyStatistics({
        ownerUserId: ctx.ownerUserId,
        runId: ctx.runId,
        artifactText: artifact.text,
      });
      return jsonResult(result);
    },
    { annotations: { readOnlyHint: true } },
  );

  const runComputation = tool(
    "runComputation",
    "Run an approved computation (e.g. meta-analysis synthesis) in the sandbox. The user must approve before it runs.",
    {
      computationKind: z.enum(["stat_verification", "meta_analysis", "data_analysis"]),
      artifactId: z.string().optional(),
      prompt: z.string().max(4_000).optional(),
    },
    async (args) => {
      const artifact = args.artifactId
        ? await ctx.store.getArtifact(args.artifactId)
        : null;
      const result = await ctx.sandbox.runComputation({
        ownerUserId: ctx.ownerUserId,
        runId: ctx.runId,
        computationKind: args.computationKind,
        artifactText: artifact?.text,
        prompt: args.prompt,
      });
      return jsonResult(result);
    },
  );

  return [verifyStatistics, runComputation];
}
