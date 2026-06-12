import { tool } from "@anthropic-ai/claude-agent-sdk";
import { isApproved } from "@aqsha/agent-contracts";
import { z } from "zod";
import { errorResult, jsonResult, type RunToolContext } from "./context";

/**
 * The workspace the user picked in the latest approved proposeArtifact card
 * (structured `response.workspaceId`, Step 3). The user's pick wins over the
 * workspaceId the model passes to executeArtifact.
 */
export async function approvedWorkspaceOverride(
  ctx: Pick<RunToolContext, "store" | "threadId">,
): Promise<string | undefined> {
  const interactions = await ctx.store.listInteractions(ctx.threadId);
  for (let i = interactions.length - 1; i >= 0; i -= 1) {
    const interaction = interactions[i];
    if (!interaction) {
      continue;
    }
    if (interaction.toolName === "proposeArtifact" && isApproved(interaction)) {
      return interaction.response?.kind === "approval"
        ? interaction.response.workspaceId
        : undefined;
    }
  }
  return undefined;
}

// Artifact HITL tools (port of agent/hitl/hitlTools.ts under the new model):
// - proposeArtifact / deleteArtifact are approval-gated by canUseTool (the
//   handler only runs after the user approved in the hold-window).
// - executeArtifact is double-gated: excluded from the initial turn allow-list
//   AND verified by the PreToolUse hook against an approved proposeArtifact.

export function buildArtifactTools(ctx: RunToolContext) {
  const proposeArtifact = tool(
    "proposeArtifact",
    "Propose creating or updating a workspace artifact. Provide a title, short summary, and 1-8 plan bullets — never the final body. The user must approve before you may write content with executeArtifact.",
    {
      action: z.enum(["create", "update"]),
      artifactId: z.string().optional(),
      workspaceId: z.string().optional(),
      title: z.string().min(1).max(300),
      artifactType: z.string().optional(),
      summary: z.string().min(1).max(2_000),
      planBullets: z.array(z.string().min(1).max(500)).min(1).max(8),
    },
    async (args) => {
      // Reaching the handler means canUseTool resolved the approval in-window.
      return jsonResult({
        approved: true,
        action: args.action,
        title: args.title,
        artifactType: args.artifactType,
        artifactId: args.artifactId,
        workspaceId: args.workspaceId,
        next: "Call executeArtifact exactly once with the complete final content.",
      });
    },
  );

  const executeArtifact = tool(
    "executeArtifact",
    "Write the approved artifact content (create or update). Only valid after the user approved the matching proposeArtifact in this thread.",
    {
      action: z.enum(["create", "update"]),
      artifactId: z.string().optional(),
      workspaceId: z.string().optional(),
      title: z.string().min(1).max(300),
      artifactType: z.string().optional(),
      content: z.string().min(1).max(200_000),
    },
    async (args) => {
      const workspaceOverride = await approvedWorkspaceOverride(ctx);
      const result = await ctx.store.applyArtifactAction(ctx.ownerUserId, ctx.threadId, {
        action: args.action,
        artifactId: args.artifactId,
        workspaceId: workspaceOverride ?? args.workspaceId,
        title: args.title,
        artifactType: args.artifactType,
        content: args.content,
      });
      if (!result.ok) {
        return errorResult(result.reason ?? "Artifact write failed.");
      }
      return jsonResult({ ok: true, artifactId: result.artifactId, action: args.action });
    },
  );

  const deleteArtifact = tool(
    "deleteArtifact",
    "Delete a workspace artifact. The user must confirm before it runs.",
    { artifactId: z.string().min(1) },
    async (args) => {
      const result = await ctx.store.applyArtifactAction(ctx.ownerUserId, ctx.threadId, {
        action: "delete",
        artifactId: args.artifactId,
      });
      if (!result.ok) {
        return errorResult(result.reason ?? "Artifact delete failed.");
      }
      return jsonResult({ ok: true, artifactId: args.artifactId, action: "delete" });
    },
  );

  return [proposeArtifact, executeArtifact, deleteArtifact];
}
