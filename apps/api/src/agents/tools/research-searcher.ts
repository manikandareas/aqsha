import { tool } from "ai";
import { z } from "zod";
import type { SearcherAgent } from "../subagents";
import { sourceClassEnum } from "../subagents/schemas";

export function createResearchSearcherTool(deps: { agent: SearcherAgent }) {
  return tool({
    description:
      "Discover candidate sources for ONE sub-question via Exa web search. Returns a ranked list of up to 15 candidates. Call this multiple times in parallel for different sub-questions (max 3 concurrent).",
    inputSchema: z.object({
      subQuestion: z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        sourceClasses: z.array(sourceClassEnum).min(1),
        minSources: z.number().int().min(1).max(10),
      }),
      questionContext: z
        .string()
        .describe("The full research question for context.")
        .min(1),
    }),
    execute: async ({ subQuestion, questionContext }, { abortSignal }) => {
      const prompt = [
        `Research question: ${questionContext}`,
        `Sub-question (${subQuestion.id}): ${subQuestion.text}`,
        `Preferred source classes: ${subQuestion.sourceClasses.join(", ")}`,
        `Target minimum sources: ${subQuestion.minSources}`,
        "",
        "Use web_search_exa to find candidates. Return the structured search results.",
      ].join("\n");

      const result = await deps.agent.generate({
        prompt,
        abortSignal,
      });

      return result.output;
    },
  });
}
