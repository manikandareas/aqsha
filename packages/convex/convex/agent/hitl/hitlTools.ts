import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  agentWritableArtifactTypeEnum,
  artifactTypeFromAgentInput,
  plainTextFromMarkdown,
} from "../../artifacts/model";
import { throwAppError } from "../../lib/appError";
import {
  isLikelyConvexId,
  requireToolMessageId,
  requireToolThread,
  requireToolUser,
} from "../tools/toolContext";
import {
  DEEP_RESEARCH_STARTED_STATUS,
  type DeepResearchStartedResult,
} from "../research/deepResearchContract";

const optionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(240),
});

const questionSchema = z.object({
  prompt: z.string().min(1).max(500),
  options: z.array(optionSchema).min(2).max(8),
  allowCustom: z.boolean().optional(),
});

const artifactTypeEnum = agentWritableArtifactTypeEnum;

/**
 * Native in-thread HITL tool set. The model triggers HITL by calling these
 * tools in the ordinary course of generation:
 *  - `askUser` has NO execute, so the AI SDK loop halts at the call and the
 *    question rides in the thread as an orphaned tool-call awaiting a
 *    tool-result (supplied by the user via api.agent.hitl.hitlResume.answerAskUser).
 *  - the action tools carry `needsApproval`, so generation pauses with a
 *    `tool-approval-request` part; the user approves/denies via
 *    api.agent.hitl.hitlResume.approveTool / denyTool, then the component runs the
 *    tool's own `execute` (approve) or synthesizes a denied result (deny).
 *  - artifact create/update is two-step: `proposeArtifact` (needsApproval,
 *    display-only) is approved first, then the model calls `executeArtifact`
 *    with the final content. `executeArtifact` itself is NOT approval-gated: it
 *    is withheld from the initial turn via the `activeTools` allow-list in
 *    agent/messages.ts (runInlineGeneration). On the post-approval resume the whole
 *    toolset is open, so a per-step `prepareStep` hard gate (AUD-01,
 *    agent/hitl/executeArtifactGate.ts) keeps executeArtifact inert until an
 *    approved proposeArtifact is actually present in the conversation.
 */
export function buildHitlTools(args: { promptMessageId: string }): ToolSet {
  return {
    askUser: createTool({
      description:
        "Ask the user one or more structured clarifying questions when you genuinely cannot proceed without information only the user has. Shown as interactive question cards in the UI. Each question needs 2-8 options with stable ids. Never repeat the questions in plain chat text.",
      inputSchema: z.object({
        questions: z.array(questionSchema).min(1).max(5),
      }),
      // No execute handler: the loop halts at this call and waits for the user's
      // answer, which is supplied out-of-band by api.agent.hitl.hitlResume.answerAskUser
      // as a native tool-result. The component requires an outputSchema for
      // no-execute tools so it knows the shape of that supplied result.
      outputSchema: z.object({
        answers: z.array(
          z.object({
            prompt: z.string(),
            selectedOptionIds: z.array(z.string()).optional(),
            customAnswer: z.string().optional(),
            skipped: z.boolean().optional(),
          }),
        ),
      }),
    }),

    proposeArtifact: createTool({
      description:
        "Propose creating or updating a workspace artifact for the user to approve (Review Plan card). Provide a title, a short summary, and 1-8 plan bullets describing what you will write. Do NOT include the final body here. After the user approves, call executeArtifact with the full content.",
      inputSchema: z.object({
        action: z.enum(["create", "update"]),
        artifactId: z.string().optional(),
        workspaceId: z.string().optional(),
        title: z.string().min(1).max(160),
        artifactType: artifactTypeEnum.default("markdown"),
        summary: z.string().min(1).max(1000),
        planBullets: z.array(z.string().max(240)).min(1).max(8),
      }),
      needsApproval: true,
      execute: async (_ctx, input) => ({
        approved: true as const,
        action: input.action,
        title: input.title,
        artifactType: input.artifactType,
        artifactId: input.artifactId,
        workspaceId: input.workspaceId,
      }),
    }),

    executeArtifact: createTool({
      description:
        "Write the workspace artifact that the user just approved via proposeArtifact. Call exactly once with the complete final content.",
      inputSchema: z.object({
        action: z.enum(["create", "update"]),
        artifactId: z.string().optional(),
        workspaceId: z.string().optional(),
        title: z.string().min(1).max(160),
        artifactType: artifactTypeEnum.default("markdown"),
        content: z.string().min(1).max(200_000),
        language: z.string().max(40).optional(),
      }),
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const messageId = requireToolMessageId(ctx, args.promptMessageId);
        const artifactType = artifactTypeFromAgentInput(input.artifactType ?? "markdown");
        const plainText =
          artifactType === "markdown" ? plainTextFromMarkdown(input.content) : input.content;
        if (input.action === "create") {
          const workspace = await ctx.runQuery(
            internal.agent.hitl.hitlProvenance.resolveWorkspaceForCreate,
            {
              ownerUserId,
              threadId,
              workspaceId: isLikelyConvexId(input.workspaceId)
                ? (input.workspaceId as Id<"workspaces">)
                : undefined,
            },
          );
          if (!workspace.workspaceId) {
            throwAppError({
              code: "workspace_required",
              message: "Pilih workspace sebelum membuat artifact.",
              severity: "warning",
              field: "workspaceId",
            });
          }
          const artifactId = await ctx.runMutation(
            internal.artifacts.createArtifactFromAgentInternal,
            {
              ownerUserId,
              workspaceId: workspace.workspaceId,
              title: input.title,
              artifactType,
              content: input.content,
              plainText,
              language: input.language,
            },
          );
          await ctx.runMutation(internal.agent.hitl.hitlProvenance.recordArtifactRelation, {
            ownerUserId,
            threadId,
            messageId,
            artifactId,
            relation: "created",
          });
          return { status: "executed" as const, artifactId, relation: "created" as const };
        }
        const artifactId = isLikelyConvexId(input.artifactId)
          ? (input.artifactId as Id<"artifacts">)
          : undefined;
        if (!artifactId) {
          throwAppError({
            code: "artifact_required",
            message: "artifactId wajib untuk memperbarui artifact.",
            severity: "error",
            field: "artifactId",
          });
        }
        await ctx.runQuery(internal.agent.hitl.hitlProvenance.assertManageable, {
          ownerUserId,
          artifactId,
        });
        await ctx.runMutation(internal.artifacts.updateArtifactFromAgentInternal, {
          ownerUserId,
          artifactId,
          title: input.title,
          artifactType,
          content: input.content,
          plainText,
          language: input.language,
        });
        await ctx.runMutation(internal.agent.hitl.hitlProvenance.recordArtifactRelation, {
          ownerUserId,
          threadId,
          messageId,
          artifactId,
          relation: "updated",
        });
        return { status: "executed" as const, artifactId, relation: "updated" as const };
      },
    }),

    deleteArtifact: createTool({
      description:
        "Delete a workspace artifact. Requires user confirmation before it runs. Provide the artifact id plus a short confirmation title and message.",
      inputSchema: z.object({
        artifactId: z.string(),
        title: z.string().min(1).max(160),
        message: z.string().min(1).max(500),
      }),
      needsApproval: true,
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const messageId = requireToolMessageId(ctx, args.promptMessageId);
        if (!isLikelyConvexId(input.artifactId)) {
          throwAppError({
            code: "artifact_required",
            message: "artifactId wajib untuk menghapus artifact.",
            severity: "error",
            field: "artifactId",
          });
        }
        const artifactId = input.artifactId as Id<"artifacts">;
        await ctx.runQuery(internal.agent.hitl.hitlProvenance.assertManageable, {
          ownerUserId,
          artifactId,
        });
        await ctx.runMutation(internal.artifacts.deleteArtifactFromAgentInternal, {
          ownerUserId,
          artifactId,
        });
        await ctx.runMutation(internal.agent.hitl.hitlProvenance.recordArtifactRelation, {
          ownerUserId,
          threadId,
          messageId,
          artifactId,
          relation: "deleted",
        });
        return { status: "deleted" as const, artifactId };
      },
    }),

    createWorkspace: createTool({
      description:
        "Create a new workspace. Requires user approval. Provide the final workspace name plus a short summary and plan bullets for the approval card.",
      inputSchema: z.object({
        name: z.string().min(1).max(160),
        summary: z.string().min(1).max(1000),
        planBullets: z.array(z.string().max(240)).min(1).max(8),
      }),
      needsApproval: true,
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const messageId = requireToolMessageId(ctx, args.promptMessageId);
        const workspaceId = await ctx.runMutation(
          internal.workspaces.createFromAgentInternal,
          { ownerUserId, name: input.name },
        );
        await ctx.runMutation(internal.agent.hitl.hitlProvenance.recordWorkspaceAction, {
          ownerUserId,
          threadId,
          messageId,
          workspaceId,
          action: "created",
        });
        return {
          status: "executed" as const,
          workspaceId,
          action: "create_workspace" as const,
        };
      },
    }),

    renameWorkspace: createTool({
      description:
        "Rename an existing workspace. Requires user approval. Provide the workspace id and the final new name plus a short summary and plan bullets.",
      inputSchema: z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(160),
        summary: z.string().min(1).max(1000),
        planBullets: z.array(z.string().max(240)).min(1).max(8),
      }),
      needsApproval: true,
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const messageId = requireToolMessageId(ctx, args.promptMessageId);
        if (!isLikelyConvexId(input.workspaceId)) {
          throwAppError({
            code: "workspace_required",
            message: "workspaceId wajib untuk mengganti nama workspace.",
            severity: "error",
            field: "workspaceId",
          });
        }
        const workspaceId = input.workspaceId as Id<"workspaces">;
        await ctx.runMutation(internal.workspaces.renameFromAgentInternal, {
          ownerUserId,
          workspaceId,
          name: input.name,
        });
        await ctx.runMutation(internal.agent.hitl.hitlProvenance.recordWorkspaceAction, {
          ownerUserId,
          threadId,
          messageId,
          workspaceId,
          action: "renamed",
        });
        return {
          status: "executed" as const,
          workspaceId,
          action: "rename_workspace" as const,
        };
      },
    }),
  };
}

/**
 * Deep-research HITL tool. The model proposes an autonomous research plan via
 * `startDeepResearch` (needsApproval); on approval the tool's execute kicks off
 * the durable research workflow. Offered only on the /deep-research turn (and
 * its resume) via activeTools, never in normal chat.
 */
export function buildDeepResearchTools(args: {
  promptMessageId: string;
  runId: Id<"agentRuns">;
}): ToolSet {
  return {
    startDeepResearch: createTool({
      description:
        "Propose an autonomous deep-research plan for the user to approve. Provide research questions, a source strategy, the intended report shape, concrete sufficiency criteria, initial search queries, and a round budget. After the user approves, the research runs automatically and produces a cited report. Call this exactly once.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        questions: z.array(z.string().min(1).max(300)).min(1).max(5),
        sourceStrategy: z.string().min(1).max(600),
        reportIntent: z.string().min(1).max(600),
        sufficiencyCriteria: z.array(z.string().min(1).max(300)).min(1).max(6),
        initialQueries: z.array(z.string().min(1).max(300)).min(1).max(5),
        maxRounds: z.number().int().min(1).max(8),
      }),
      needsApproval: true,
      execute: async (ctx, input) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        const result = await ctx.runMutation(
          internal.agent.research.deepResearch.startExecuteFromPlan,
          {
            runId: args.runId,
            ownerUserId,
            threadId,
            promptMessageId: args.promptMessageId,
            plan: input,
          },
        );
        const started: DeepResearchStartedResult = {
          status: DEEP_RESEARCH_STARTED_STATUS,
          workflowId: result.workflowId,
        };
        return started;
      },
    }),
  };
}

