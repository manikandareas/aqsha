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
  // Deep-research plan gate (docs/deep-research-plan-gate-plan.md §6.1). The user
  // reviews the `proposeResearchPlan` card and decides: start (run the research,
  // optionally with an edited plan), revise (model re-decomposes with an
  // instruction), or reject (cancel the run). Carried on the same `tool_approval`
  // interaction as `proposeResearchPlan`; the Convex guard restricts this kind to
  // that tool only (no schema change to pendingInteractions).
  z.object({
    kind: z.literal("plan_decision"),
    decision: z.enum(["start", "revise", "reject"]),
    editedPlan: z.string().max(20_000).optional(),
    revisionInstruction: z.string().max(2_000).optional(),
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

// ── deep-research plan payload (plan §6.1) ───────────────────────────────────
//
// Structure for the `proposeResearchPlan` tool: a typed contract over a fragile
// Markdown parser (memory `code-organization-emphasis`). The card edits/renders
// the same shape on every side; `renderResearchPlanMarkdown` is the SINGLE source
// of truth for the prose format so the deep-research phase prompts read a
// deterministic `priorOutputs.plan`. Bounds are slightly wider than the tool's
// own input zod (questions 1–8 vs 3–6) so an edited or fallback plan still parses.
export const researchPlanPayloadSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(500).optional(),
  questions: z.array(z.string().min(1).max(500)).min(1).max(8),
});
export type ResearchPlanPayload = z.infer<typeof researchPlanPayloadSchema>;

/**
 * Parse a stored `proposeResearchPlan` payload defensively. Returns a graceful
 * fallback (`{ title: "Rencana riset", questions: [] }`) rather than throwing, so
 * a malformed/legacy payload still renders a non-crashing card.
 */
export function parseResearchPlanPayload(raw: unknown): ResearchPlanPayload {
  const parsed = researchPlanPayloadSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { title: "Rencana riset", questions: [] };
}

/**
 * The one canonical Markdown form of a research plan. Used by the web client
 * (on `start`) AND the agent service (fallback + `start` without an edited plan)
 * so the deep-research phases always read the same `section("Research plan", …)`.
 */
export function renderResearchPlanMarkdown(plan: ResearchPlanPayload): string {
  const blocks: string[] = [`## ${plan.title}`];
  const summary = plan.summary?.trim();
  if (summary) blocks.push(summary);
  if (plan.questions.length > 0) {
    blocks.push(
      plan.questions.map((question, i) => `${i + 1}. ${question}`).join("\n"),
    );
  }
  return blocks.join("\n\n");
}
