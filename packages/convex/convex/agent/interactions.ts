import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, mutation } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { throwAppError } from "../lib/appError";
import { humanizeInteractionResponse } from "./hitl/humanize";
import { bumpThreadOnMessage, findRun, findThread } from "./service/model";

// Unified HITL response endpoint (plan §5.3): one mutation replaces the legacy
// answerAskUser / approveTool / denyTool trio. The response is recorded in
// Convex FIRST (HITL state must survive service restarts); the service is only
// notified when the run already interrupted (waiting_hitl) and needs a resume.
// The in-place hold-window path needs no HTTP call — the service polls the
// interaction row and sees `responded`.

const answerValidator = v.object({
  prompt: v.string(),
  selectedOptionIds: v.optional(v.array(v.string())),
  customAnswer: v.optional(v.string()),
  skipped: v.optional(v.boolean()),
});

const responseValidator = v.union(
  v.object({
    kind: v.literal("answers"),
    answers: v.array(answerValidator),
  }),
  v.object({
    kind: v.literal("approval"),
    approved: v.boolean(),
    note: v.optional(v.string()),
    // Structured workspace pick from the approval card (Step 3).
    workspaceId: v.optional(v.string()),
  }),
  // Deep-research plan gate (plan §5.2). Carried on the `proposeResearchPlan`
  // tool_approval interaction; the guard below restricts this kind to that tool.
  v.object({
    kind: v.literal("plan_decision"),
    decision: v.union(
      v.literal("start"),
      v.literal("revise"),
      v.literal("reject"),
    ),
    editedPlan: v.optional(v.string()),
    revisionInstruction: v.optional(v.string()),
  }),
);

export const respond = mutation({
  args: {
    interactionId: v.id("pendingInteractions"),
    response: responseValidator,
  },
  returns: v.object({ ok: v.boolean(), resuming: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const interaction = await ctx.db.get("pendingInteractions", args.interactionId);
    if (!interaction || interaction.ownerUserId !== user._id) {
      throwAppError({
        message: "Interaction not found",
        code: "interaction_not_found",
      });
    }
    if (interaction.status !== "pending") {
      throwAppError({
        message: "This request has already been handled",
        code: "interaction_not_pending",
        severity: "info",
      });
    }
    // Guard the type↔kind contract by toolName, not just type (plan §5.2): the
    // research-plan card uses a `tool_approval` row but expects a `plan_decision`,
    // not an `approval`. Routing on `toolName` keeps every OTHER tool_approval
    // (artifact/workspace cards) accepting only `approval`, so a stray
    // `plan_decision` can never be smuggled into them.
    if (interaction.type === "ask_user") {
      if (args.response.kind !== "answers") {
        throwAppError({
          message: "This interaction expects answers",
          code: "interaction_response_mismatch",
        });
      }
    } else if (interaction.toolName === "proposeResearchPlan") {
      if (args.response.kind !== "plan_decision") {
        throwAppError({
          message: "This interaction expects a research-plan decision",
          code: "interaction_response_mismatch",
        });
      }
    } else if (args.response.kind !== "approval") {
      throwAppError({
        message: "This interaction expects an approval decision",
        code: "interaction_response_mismatch",
      });
    }
    const now = Date.now();
    await ctx.db.patch("pendingInteractions", interaction._id, {
      status: "responded",
      responseJson: JSON.stringify(args.response),
      respondedAt: now,
    });

    // Materialize the answer as a real user message so the thread reads as a
    // normal conversation: agent question (turn) → user answer (bubble) →
    // agent continuation (resume). The interaction question stays visible
    // because listInteractions also returns `responded` rows.
    const thread = await findThread(ctx, interaction.threadId);
    if (thread) {
      const text = humanizeInteractionResponse({
        payloadJson: interaction.payloadJson,
        response: args.response,
      });
      await ctx.db.insert("chatMessages", {
        threadId: interaction.threadId,
        ownerUserId: user._id,
        role: "user",
        text,
        runId: interaction.runId,
        status: "complete",
        createdAt: now,
      });
      await bumpThreadOnMessage(ctx, thread, { text, countDelta: 1 });
    }

    // Resume only when the run already interrupted (waiting_hitl). The service's
    // resume re-primes a gated tool so it executes on the model's retry.
    const run = await findRun(ctx, interaction.runId);
    const resuming = Boolean(
      run && (run.status === "waiting_hitl" || run.status === "waiting"),
    );
    if (resuming) {
      await ctx.scheduler.runAfter(0, internal.agent.interactions.forwardResume, {
        runId: interaction.runId,
        interactionId: String(interaction._id),
      });
    }
    return { ok: true, resuming };
  },
});

const RESUME_ATTEMPTS = 3;

export const forwardResume = internalAction({
  args: { runId: v.string(), interactionId: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const baseUrl = process.env.AGENTS_SERVICE_URL?.trim()?.replace(/\/$/, "");
    const token = process.env.AGENTS_SERVICE_TOKEN?.trim();
    if (!baseUrl || !token) {
      console.error("forwardResume: AGENTS_SERVICE_URL/TOKEN not configured");
      return null;
    }
    for (let attempt = 1; attempt <= RESUME_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/runs/${args.runId}/resume`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ interactionId: args.interactionId }),
        });
        if (response.ok || response.status === 409) {
          // 409 = run no longer waiting (already resumed or finished) — done.
          return null;
        }
      } catch {
        // Service temporarily unreachable — retry below.
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
    // The interaction stays `responded` in Convex; the run remains
    // waiting_hitl and can be resumed once the service is back (Step 3
    // hardening adds automatic recovery on service boot).
    console.error(`forwardResume: service unreachable for run ${args.runId}`);
    return null;
  },
});
