import { Agent, stepCountIs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action } from "./_generated/server";
import { authComponent } from "./auth";

const astra = new Agent(components.agent, {
  name: "Astra",
  languageModel: openai.chat("gpt-4o-mini"),
  instructions:
    "You are Astra, Aqsha's concise product research assistant. Answer directly and keep smoke-test responses short.",
  stopWhen: stepCountIs(3),
});

export const sendPrompt = action({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, { prompt }) => {
    const user = await authComponent.getAuthUser(ctx);
    const { threadId } = await astra.createThread(ctx, {
      userId: user._id,
      title: "Astra smoke test",
    });
    const result = await astra.generateText(
      ctx,
      { threadId, userId: user._id },
      { prompt },
    );

    return {
      threadId,
      text: result.text,
    };
  },
});
