import { tool } from "ai";
import { z } from "zod";
import type { CriticAgent } from "../subagents";
import { bibliographyEntrySchema, evidenceCardSchema } from "../subagents/schemas";

export function createResearchCriticTool(deps: { agent: CriticAgent }) {
  return tool({
    description:
      "Verify a draft research report against evidence cards and bibliography. Returns ok=true when the draft is faithful, ok=false with issues otherwise. Always call this BEFORE writing the final answer.",
    inputSchema: z.object({
      question: z.string().min(1),
      draftReport: z.string().min(1),
      evidenceCards: z.array(evidenceCardSchema).min(1),
      bibliography: z.array(bibliographyEntrySchema).min(1),
    }),
    execute: async ({ question, draftReport, evidenceCards, bibliography }, { abortSignal }) => {
      const prompt = [
        `Research question: ${question}`,
        "",
        "Draft report (markdown):",
        draftReport,
        "",
        `Bibliography (${bibliography.length} entries):`,
        JSON.stringify(bibliography, null, 2),
        "",
        `Evidence cards (${evidenceCards.length}):`,
        JSON.stringify(evidenceCards, null, 2),
        "",
        "Verify the draft. Return ok=true with issues=[] if clean, otherwise ok=false with specific issues.",
      ].join("\n");

      const result = await deps.agent.generate({
        prompt,
        abortSignal,
      });

      return result.output;
    },
  });
}
