import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { workspaceManagementPayloadSchema } from "./agent/hitlPayloads";

export async function executeWorkspaceManagement(
  ctx: MutationCtx,
  args: {
    session: Doc<"hitlSessions">;
    card: Doc<"hitlCards">;
    payload: {
      action: "create_workspace" | "rename_workspace";
      name: string;
      workspaceId?: string;
    };
    userId: string;
    now: number;
    pickedWorkspaceId?: Id<"workspaces">;
  },
) {
  const payload = workspaceManagementPayloadSchema.parse(args.payload);
  const messageId = args.session.promptMessageId;

  if (payload.action === "create_workspace") {
    const workspaceId = await ctx.runMutation(internal.workspaces.createFromAgentInternal, {
      ownerUserId: args.userId,
      name: payload.name,
    });
    await ctx.db.insert("messageWorkspaceActions", {
      ownerUserId: args.userId,
      threadId: args.session.threadId,
      messageId,
      workspaceId,
      action: "created",
      createdAt: args.now,
    });
  } else {
    const workspaceId = payload.workspaceId ?? args.pickedWorkspaceId;
    if (!workspaceId) {
      throw new ConvexError("Choose a workspace before confirming rename");
    }
    await ctx.runMutation(internal.workspaces.renameFromAgentInternal, {
      ownerUserId: args.userId,
      workspaceId: workspaceId as Id<"workspaces">,
      name: payload.name,
    });
    await ctx.db.insert("messageWorkspaceActions", {
      ownerUserId: args.userId,
      threadId: args.session.threadId,
      messageId,
      workspaceId: workspaceId as Id<"workspaces">,
      action: "renamed",
      createdAt: args.now,
    });
  }

  await ctx.db.patch("hitlSessions", args.session._id, {
    phase: "completed",
    resolvedAt: args.now,
  });
  if (args.session.runId) {
    await ctx.db.patch("agentRuns", args.session.runId, {
      status: "completed",
      updatedAt: args.now,
      completedAt: args.now,
    });
  }
}
