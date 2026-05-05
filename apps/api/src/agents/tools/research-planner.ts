import { tool } from "ai";
import { z } from "zod";
import type { PlannerAgent } from "../subagents";

export function createResearchPlannerTool(deps: { agent: PlannerAgent }) {
  return tool({
    description:
      "Plan a deep-research request. Returns a structured plan: depth tier, sub-questions, success criteria, and exclusions. Call this FIRST for any research task.",
    inputSchema: z.object({
      task: z
        .string()
        .min(8)
        .describe("The full user research request, including any constraints or audience hints."),
    }),
    execute: async ({ task }, { abortSignal }) => {
      const result = await deps.agent.generate({
        prompt: task,
        abortSignal,
      });

      return result.output;
    },
  });
}
