import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { errorResult, jsonResult, type RunToolContext } from "./context";

// Workspace HITL tools — approval-gated via canUseTool (plan §5.3).

export function buildWorkspaceTools(ctx: RunToolContext) {
  const createWorkspace = tool(
    "createWorkspace",
    "Create a new workspace for the user. The user must approve before it runs.",
    {
      name: z.string().min(1).max(120),
      emoji: z.string().max(8).optional(),
    },
    async (args) => {
      const result = await ctx.store.applyWorkspaceAction(ctx.ownerUserId, {
        action: "create",
        name: args.name,
        emoji: args.emoji,
      });
      if (!result.ok) {
        return errorResult(result.reason ?? "Workspace creation failed.");
      }
      return jsonResult({ ok: true, workspaceId: result.workspaceId, name: args.name });
    },
  );

  const renameWorkspace = tool(
    "renameWorkspace",
    "Rename an existing workspace. The user must approve before it runs.",
    {
      workspaceId: z.string().min(1),
      name: z.string().min(1).max(120),
    },
    async (args) => {
      const result = await ctx.store.applyWorkspaceAction(ctx.ownerUserId, {
        action: "rename",
        workspaceId: args.workspaceId,
        name: args.name,
      });
      if (!result.ok) {
        return errorResult(result.reason ?? "Workspace rename failed.");
      }
      return jsonResult({ ok: true, workspaceId: args.workspaceId, name: args.name });
    },
  );

  return [createWorkspace, renameWorkspace];
}
