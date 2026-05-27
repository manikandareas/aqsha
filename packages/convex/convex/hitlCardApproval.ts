import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { buildApprovedArtifactExecutionPrompt } from "./agent/hitlContinuations";
import { parseApprovedCardPayload } from "./agent/hitlPayloads";
import { formatAnswersForPrompt, parseAnswersJson } from "./hitlSessionLogic";
import { assertDocumentWorkspaceArtifact } from "./hitlWorkspace";
import { executeWorkspaceManagement } from "./hitlWorkspaceExecution";

export type ApprovedCardContext = {
  session: Doc<"hitlSessions">;
  card: Doc<"hitlCards">;
  userId: string;
  now: number;
  targetWorkspaceId?: Id<"workspaces">;
};

export type ApprovedCardDispatchResult =
  | { kind: "completed" }
  | {
      kind: "schedule_artifact_execution";
      prompt: string;
      visiblePrompt: string;
      hitlSessionId: Id<"hitlSessions">;
      hitlWorkspaceId?: Id<"workspaces">;
      hitlPayloadJson?: string;
    };

export async function dispatchApprovedCard(
  ctx: MutationCtx,
  args: ApprovedCardContext,
): Promise<ApprovedCardDispatchResult> {
  const payload = parseApprovedCardPayload(args.card.payloadJson);

  switch (payload.action) {
    case "create_workspace":
    case "rename_workspace":
      await executeWorkspaceManagement(ctx, {
        session: args.session,
        card: args.card,
        payload,
        userId: args.userId,
        now: args.now,
        pickedWorkspaceId: args.targetWorkspaceId,
      });
      return { kind: "completed" };

    case "delete":
      await executeArtifactDelete(ctx, {
        session: args.session,
        payload,
        userId: args.userId,
        now: args.now,
      });
      return { kind: "completed" };

    case "create":
    case "update": {
      const run = args.session.runId
        ? await ctx.db.get("agentRuns", args.session.runId)
        : null;
      const prompt =
        run?.promptSnapshot ?? `Execute approved plan for thread ${args.session.threadId}`;
      const answersContext = formatAnswersForPrompt(parseAnswersJson(args.session.answersJson));
      return {
        kind: "schedule_artifact_execution",
        prompt: buildApprovedArtifactExecutionPrompt({
          prompt,
          answersContext,
          cardTitle: args.card.title ?? "Plan",
          cardSummary: args.card.summary ?? "",
          planBullets: args.card.planBullets,
        }),
        visiblePrompt: prompt,
        hitlSessionId: args.session._id,
        hitlWorkspaceId: args.targetWorkspaceId,
        hitlPayloadJson: args.card.payloadJson,
      };
    }

    default: {
      const _exhaustive: never = payload;
      throw new ConvexError(`Unsupported approved card action: ${String(_exhaustive)}`);
    }
  }
}

async function executeArtifactDelete(
  ctx: MutationCtx,
  args: {
    session: Doc<"hitlSessions">;
    payload: { artifactId: string; title?: string };
    userId: string;
    now: number;
  },
) {
  const artifactId = args.payload.artifactId as Id<"artifacts">;
  await assertDocumentWorkspaceArtifact(ctx, args.userId, artifactId);
  await ctx.runMutation(internal.artifacts.deleteDocumentFromAgentInternal, {
    ownerUserId: args.userId,
    artifactId,
  });
  const messageId = args.session.assistantMessageId ?? args.session.promptMessageId;
  await ctx.db.insert("messageWorkspaceArtifacts", {
    ownerUserId: args.userId,
    threadId: args.session.threadId,
    messageId,
    artifactId,
    relation: "deleted",
    createdAt: args.now,
  });
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
