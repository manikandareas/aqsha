import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { artifactTypeFromAgentInput, plainTextFromMarkdown } from "../artifactModel";
import {
  artifactPayloadSchema,
  workspaceManagementPayloadSchema,
} from "./hitlPayloads";

type HitlToolCtx = ActionCtx & {
  userId?: string;
  threadId?: string;
};

export type HitlToolProfile = "artifact" | "workspace";

const optionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(240),
});

const questionSchema = z.object({
  prompt: z.string().min(1).max(500),
  options: z.array(optionSchema).min(2).max(8),
  allowCustom: z.boolean().optional(),
});

export function createHitlTools(args: {
  profile: HitlToolProfile;
  promptMessageId: string;
  runId?: Id<"agentRuns">;
  commandId?: string;
  sourceKind?: "artifact" | "deep_research" | "generic";
}): ToolSet {
  const sourceKind =
    args.profile === "workspace" ? ("generic" as const) : (args.sourceKind ?? "artifact");

  const askHuman = createTool({
    description:
      args.profile === "workspace"
        ? "REQUIRED for clarification during /workspace. Shows interactive question cards in the UI. Never ask the same questions in chat text."
        : "REQUIRED for any clarification during /artifact. Shows interactive question cards in the UI. Never ask the same questions in chat text. Each question needs 2-8 options with stable ids (e.g. create, update, delete, other).",
    inputSchema: z.object({
      questions: z.array(questionSchema).min(1).max(5),
    }),
    execute: async (ctx, input) => {
      const ownerUserId = requireToolUser(ctx);
      const threadId = requireToolThread(ctx);
      return await ctx.runMutation(internal.hitlSessions.createQuestionCardsInternal, {
        ownerUserId,
        threadId,
        promptMessageId: args.promptMessageId,
        runId: args.runId,
        commandId: args.commandId,
        sourceKind,
        questions: input.questions,
      });
    },
  });

  if (args.profile === "workspace") {
    return {
      askHuman,
      presentWorkspacePlan: createTool({
        description:
          "REQUIRED to propose creating or renaming a workspace for user approval (Review Plan card). Include the final proposed workspace name in `name`.",
        inputSchema: z.object({
          action: z.enum(["create_workspace", "rename_workspace"]),
          title: z.string().min(1).max(160),
          summary: z.string().min(1).max(1000),
          planBullets: z.array(z.string().max(240)).min(1).max(8),
          name: z.string().min(1).max(160),
          workspaceId: z.string().optional(),
        }),
        execute: async (ctx, input) => {
          const ownerUserId = requireToolUser(ctx);
          const threadId = requireToolThread(ctx);
          const payload = workspaceManagementPayloadSchema.parse({
            action: input.action,
            name: input.name,
            workspaceId: isLikelyConvexId(input.workspaceId) ? input.workspaceId : undefined,
          });
          if (input.action === "rename_workspace" && !payload.workspaceId) {
            throw new Error("workspaceId is required for rename_workspace");
          }
          return await ctx.runMutation(internal.hitlSessions.createPlanReviewCardInternal, {
            ownerUserId,
            threadId,
            promptMessageId: args.promptMessageId,
            runId: args.runId,
            commandId: args.commandId,
            sourceKind,
            title: input.title,
            summary: input.summary,
            planBullets: input.planBullets,
            payloadJson: JSON.stringify(payload),
            workspaceId: payload.workspaceId
              ? (payload.workspaceId as Id<"workspaces">)
              : undefined,
          });
        },
      }),
    };
  }

  return {
    askHuman,
    presentPlan: createTool({
      description:
        "REQUIRED to propose create/update workspace artifacts for user approval (Review Plan card). Call when intent is clear. Include planBullets but NO final body.",
      inputSchema: z.object({
        title: z.string().min(1).max(160),
        summary: z.string().min(1).max(1000),
        planBullets: z.array(z.string().max(240)).min(1).max(8),
        action: z.enum(["create", "update"]),
        artifactType: z
          .enum(["markdown", "plain_text", "html", "svg", "mermaid", "json", "csv", "code"])
          .default("markdown"),
        artifactId: z.string().optional(),
        workspaceId: z.string().optional(),
        changeSummary: z.string().max(500).optional(),
      }),
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const payload = {
          action: input.action,
          title: input.title,
          artifactType: input.artifactType,
          artifactId: isLikelyConvexId(input.artifactId) ? input.artifactId : undefined,
          workspaceId: isLikelyConvexId(input.workspaceId) ? input.workspaceId : undefined,
          changeSummary: input.changeSummary,
        };
        return await ctx.runMutation(internal.hitlSessions.createPlanReviewCardInternal, {
          ownerUserId,
          threadId,
          promptMessageId: args.promptMessageId,
          runId: args.runId,
          commandId: args.commandId,
          sourceKind,
          title: input.title,
          summary: input.summary,
          planBullets: input.planBullets,
          payloadJson: JSON.stringify(payload),
          workspaceId: isLikelyConvexId(input.workspaceId)
            ? (input.workspaceId as Id<"workspaces">)
            : undefined,
        });
      },
    }),
    confirmAction: createTool({
      description:
        "Request user confirmation for a simple or destructive action such as deleting a workspace artifact. Does not execute until confirmed.",
      inputSchema: z.object({
        title: z.string().min(1).max(160),
        message: z.string().min(1).max(500),
        action: z.literal("delete"),
        artifactId: z.string(),
        workspaceId: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        if (!isLikelyConvexId(input.artifactId)) {
          throw new Error("artifactId is required for delete confirmation");
        }
        const payload = {
          action: "delete" as const,
          title: input.title,
          artifactId: input.artifactId,
          workspaceId: isLikelyConvexId(input.workspaceId) ? input.workspaceId : undefined,
        };
        return await ctx.runMutation(internal.hitlSessions.createConfirmationCardInternal, {
          ownerUserId,
          threadId,
          promptMessageId: args.promptMessageId,
          runId: args.runId,
          commandId: args.commandId,
          sourceKind,
          title: input.title,
          message: input.message,
          destructive: true,
          payloadJson: JSON.stringify(payload),
          workspaceId: isLikelyConvexId(input.workspaceId)
            ? (input.workspaceId as Id<"workspaces">)
            : undefined,
        });
      },
    }),
  };
}

export function createWorkspaceExecutionTools(args: {
  sessionId: Id<"hitlSessions">;
  workspaceId?: Id<"workspaces">;
  payloadJson?: string;
}): ToolSet {
  return {
    executeWorkspaceArtifact: createTool({
      description:
        "Execute an approved workspace artifact action. Call once with complete content for create/update.",
      inputSchema: z.object({
        action: z.enum(["create", "update"]),
        title: z.string().min(1).max(160),
        artifactType: z
          .enum(["markdown", "plain_text", "html", "svg", "mermaid", "json", "csv", "code"])
          .default("markdown"),
        content: z.string().min(1).max(200_000),
        language: z.string().max(40).optional(),
        artifactId: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const basePayload = args.payloadJson
          ? artifactPayloadSchema.parse(JSON.parse(args.payloadJson))
          : null;
        const artifactId = isLikelyConvexId(input.artifactId)
          ? (input.artifactId as Id<"artifacts">)
          : isLikelyConvexId(basePayload?.artifactId)
            ? (basePayload!.artifactId as Id<"artifacts">)
            : undefined;
        const artifactType = artifactTypeFromAgentInput(
          input.artifactType ?? basePayload?.artifactType ?? "markdown",
        );
        const plainText =
          artifactType === "markdown"
            ? plainTextFromMarkdown(input.content)
            : input.content;
        let resultArtifactId: Id<"artifacts">;
        if (input.action === "create") {
          if (!args.workspaceId) {
            throw new Error("Workspace is required to create an artifact");
          }
          resultArtifactId = await ctx.runMutation(
            internal.artifacts.createArtifactFromAgentInternal,
            {
              ownerUserId,
              workspaceId: args.workspaceId,
              title: input.title,
              artifactType,
              content: input.content,
              plainText,
              language: input.language,
            },
          );
        } else {
          if (!artifactId) {
            throw new Error("artifactId is required for update");
          }
          await ctx.runMutation(internal.artifacts.updateArtifactFromAgentInternal, {
            ownerUserId,
            artifactId,
            title: input.title,
            artifactType,
            content: input.content,
            plainText,
            language: input.language,
          });
          resultArtifactId = artifactId;
        }
        await ctx.runMutation(internal.hitlSessions.completeSessionInternal, {
          sessionId: args.sessionId,
          ownerUserId,
          resultArtifactId,
          relation: input.action === "create" ? "created" : "updated",
        });
        return {
          status: "executed" as const,
          artifactId: resultArtifactId,
          action: input.action,
          threadId,
        };
      },
    }),
  };
}

function requireToolUser(ctx: HitlToolCtx) {
  if (!ctx.userId) {
    throw new Error("Tool call is missing user context");
  }
  return ctx.userId;
}

function requireToolThread(ctx: HitlToolCtx) {
  if (!ctx.threadId) {
    throw new Error("Tool call is missing thread context");
  }
  return ctx.threadId;
}

function isLikelyConvexId(value: string | undefined) {
  return Boolean(value && /^[a-z0-9]{24,40}$/.test(value));
}
