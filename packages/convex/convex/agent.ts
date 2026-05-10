import { Agent, stepCountIs, type UsageHandler } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { components, internal } from "./_generated/api";

export const NORMAL_MODEL = process.env.AQSHA_NORMAL_MODEL ?? "gpt-4o-mini";

export const astra = new Agent(components.agent, {
  name: "Astra",
  languageModel: openai.chat(NORMAL_MODEL),
  instructions:
    "You are Astra, Aqsha's concise product research assistant. Answer directly, stay in normal chat mode, and do not claim to use external sources.",
  stopWhen: stepCountIs(3),
});

export const recordUsage: UsageHandler = async (ctx, args) => {
  if (!args.userId || !args.threadId) {
    return;
  }

  const inputTokens = args.usage.inputTokens ?? 0;
  const outputTokens = args.usage.outputTokens ?? 0;
  const totalTokens = args.usage.totalTokens ?? inputTokens + outputTokens;

  await ctx.runMutation(internal.messages.recordUsage, {
    ownerUserId: args.userId,
    threadId: args.threadId,
    provider: args.provider,
    model: args.model,
    inputTokens,
    outputTokens,
    totalTokens,
  });
};
