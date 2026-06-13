import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, mutation } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { throwAppError } from "../lib/appError";
import { findRun } from "./service/model";

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
    if (interaction.type === "ask_user" && args.response.kind !== "answers") {
      throwAppError({
        message: "This interaction expects answers",
        code: "interaction_response_mismatch",
      });
    }
    if (interaction.type === "tool_approval" && args.response.kind !== "approval") {
      throwAppError({
        message: "This interaction expects an approval decision",
        code: "interaction_response_mismatch",
      });
    }
    await ctx.db.patch("pendingInteractions", interaction._id, {
      status: "responded",
      responseJson: JSON.stringify(args.response),
      respondedAt: Date.now(),
    });

    // Resume only when the run already interrupted; a run still inside its
    // hold-window resolves in place via the service's interaction poller.
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
