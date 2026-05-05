import { tool } from "ai";
import { z } from "zod";
import type { ReaderAgent } from "../subagents";

export function createResearchReaderTool(deps: { agent: ReaderAgent }) {
  return tool({
    description:
      "Fetch the listed URLs and extract structured evidence cards (claims, quotes, numbers, source tier). Call this after research_searcher to deeply read the most promising candidates.",
    inputSchema: z.object({
      urls: z
        .array(z.string().min(1))
        .min(1)
        .max(4)
        .describe("Up to 4 URLs to fetch. Keep batches small to avoid context-window limits."),
      subQuestionContext: z
        .string()
        .min(1)
        .describe("The sub-question text these URLs should address."),
    }),
    execute: async ({ urls, subQuestionContext }, { abortSignal }) => {
      const prompt = [
        `Sub-question context: ${subQuestionContext}`,
        "URLs to fetch and extract evidence from:",
        ...urls.map((url) => `- ${url}`),
        "",
        "Use web_fetch_exa for each URL. Extract evidence cards per the schema. Skip URLs that fail to fetch or are irrelevant.",
      ].join("\n");

      const result = await deps.agent.generate({
        prompt,
        abortSignal,
      });

      return result.output;
    },
  });
}
