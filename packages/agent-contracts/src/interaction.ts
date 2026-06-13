import { z } from "zod";

// HITL redesign (plan §5.3): every user-facing interaction is one
// `pendingInteractions` row. Two classes: ask_user (model needs an answer) and
// tool_approval (destructive/costly tool held by canUseTool). All state lives in
// the store so interactions survive a service restart; the SDK session file is
// only a resume optimization.

export const interactionTypeSchema = z.enum(["ask_user", "tool_approval"]);
export type InteractionType = z.infer<typeof interactionTypeSchema>;

export const interactionStatusSchema = z.enum([
  "pending",
  "responded",
  "expired",
  "superseded",
]);
export type InteractionStatus = z.infer<typeof interactionStatusSchema>;

export const askUserOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
});

export const askUserQuestionSchema = z.object({
  prompt: z.string().min(1).max(500),
  options: z.array(askUserOptionSchema).min(2).max(8),
  allowCustom: z.boolean().optional(),
});
export type AskUserQuestion = z.infer<typeof askUserQuestionSchema>;

export const askUserAnswerSchema = z.object({
  prompt: z.string(),
  selectedOptionIds: z.array(z.string()).optional(),
  customAnswer: z.string().max(2_000).optional(),
  skipped: z.boolean().optional(),
});
export type AskUserAnswer = z.infer<typeof askUserAnswerSchema>;

// One unified response shape replacing answerAskUser / approveTool / denyTool.
export const interactionResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("answers"),
    answers: z.array(askUserAnswerSchema).min(1),
  }),
  z.object({
    kind: z.literal("approval"),
    approved: z.boolean(),
    note: z.string().max(2_000).optional(),
    // Structured target workspace picked in the approval card (Step 3 — was
    // previously smuggled through `note` as "workspaceId:<id>").
    workspaceId: z.string().max(128).optional(),
  }),
]);
export type InteractionResponse = z.infer<typeof interactionResponseSchema>;

export const pendingInteractionSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  type: interactionTypeSchema,
  // Logical tool name without the MCP prefix (e.g. "proposeArtifact").
  toolName: z.string().min(1),
  toolUseId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  status: interactionStatusSchema,
  response: interactionResponseSchema.optional(),
  createdAt: z.number(),
  respondedAt: z.number().optional(),
});
export type PendingInteraction = z.infer<typeof pendingInteractionSchema>;

export function isApproved(interaction: PendingInteraction): boolean {
  return (
    interaction.status === "responded" &&
    interaction.response?.kind === "approval" &&
    interaction.response.approved
  );
}
