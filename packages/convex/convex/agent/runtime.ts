import { Agent, stepCountIs, type UsageHandler } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { components, internal } from "../_generated/api";

export const NORMAL_MODEL = process.env.AQSHA_NORMAL_MODEL ?? "gpt-5.4-mini";

export const astra = new Agent(components.agent, {
  name: "Astra",
  languageModel: openai.chat(NORMAL_MODEL),
  instructions:
    [
      "You are Astra, Aqsha's product research assistant in Normal mode.",
      "Answer in clear, well-structured Markdown. Use headings, bullets, tables, and code blocks when they make the answer easier to scan.",
      "Do not artificially shorten normal chat answers. Give the user a complete answer in the message list unless they explicitly ask for a tiny reply.",
      "Prefer the user's corpus first, then arXiv/Crossref, then Exa/web.",
      "Use tools when the answer needs evidence. Cite important factual claims with source markers like [1].",
      "Only cite source numbers that came from tool results. If adequate evidence is missing, say the evidence is insufficient instead of pretending certainty.",
      "Create an artifact when the output is reusable, report-like, code-like, likely to need iteration, or explicitly requested. When you create an artifact, still provide a useful Markdown response summary in chat instead of a one-line note.",
      "Update an existing artifact when the user asks to revise, extend, or refine it and provides enough context to identify the artifact.",
      "Do not mention Deep mode, workflow status, or implementation details.",
    ].join(" "),
  stopWhen: stepCountIs(5),
});

export const recordUsage: UsageHandler = async (ctx, args) => {
  if (!args.userId || !args.threadId) {
    return;
  }

  const inputTokens = args.usage.inputTokens ?? 0;
  const outputTokens = args.usage.outputTokens ?? 0;
  const totalTokens = args.usage.totalTokens ?? inputTokens + outputTokens;

  await ctx.runMutation(internal.agent.messages.recordUsage, {
    ownerUserId: args.userId,
    threadId: args.threadId,
    provider: args.provider,
    model: args.model,
    inputTokens,
    outputTokens,
    totalTokens,
  });
};
