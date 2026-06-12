import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { jsonResult, type RunToolContext } from "./context";

// askUser (plan §5.3 class 1): persist the question card and interrupt the
// run. The user's answer later resumes the session with the answers injected
// as the continuation prompt.

export function buildAskUserTool(ctx: RunToolContext) {
  return tool(
    "askUser",
    "Ask the user one or two structured questions when the request is genuinely ambiguous. Each question needs 2-8 options. The turn pauses until the user answers — do not repeat the question in chat text.",
    {
      questions: z
        .array(
          z.object({
            prompt: z.string().min(1).max(500),
            options: z
              .array(
                z.object({
                  id: z.string().min(1).max(64),
                  label: z.string().min(1).max(200),
                }),
              )
              .min(2)
              .max(8),
            allowCustom: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(2),
    },
    async (args) => {
      const interaction = await ctx.broker.requestAskUser({
        runId: ctx.runId,
        threadId: ctx.threadId,
        ownerUserId: ctx.ownerUserId,
        questions: args.questions,
      });
      return jsonResult({
        status: "question_pending",
        interactionId: interaction.id,
        note: "The question card was shown to the user. The turn pauses now; end your reply without answering on the user's behalf.",
      });
    },
  );
}
