import { tool } from "ai";
import { z } from "zod";
import type { SynthesizerAgent } from "../subagents";
import { evidenceCardSchema } from "../subagents/schemas";

export function createResearchSynthesizerTool(deps: { agent: SynthesizerAgent }) {
  return tool({
    description:
      "Synthesize evidence cards into themes, conflicts, gaps, and a PROCEED/REFINE/PIVOT decision. Call this once you have all relevant evidence cards from research_reader.",
    inputSchema: z.object({
      question: z.string().min(1),
      evidenceCards: z.array(evidenceCardSchema).min(1),
      criticIssues: z
        .array(
          z.object({
            kind: z.string(),
            detail: z.string(),
            citationId: z.string().nullable(),
          }),
        )
        .optional()
        .describe("Issues from a previous critic pass; if present, address each one."),
    }),
    execute: async ({ question, evidenceCards, criticIssues }, { abortSignal }) => {
      const sections = [
        `Research question: ${question}`,
        "",
        `Evidence cards (${evidenceCards.length}):`,
        JSON.stringify(evidenceCards, null, 2),
      ];

      if (criticIssues && criticIssues.length > 0) {
        sections.push("", "Issues raised by the critic on the previous pass — address each:");
        sections.push(JSON.stringify(criticIssues, null, 2));
      }

      sections.push("", "Return the structured synthesis.");

      const result = await deps.agent.generate({
        prompt: sections.join("\n"),
        abortSignal,
      });

      return result.output;
    },
  });
}
