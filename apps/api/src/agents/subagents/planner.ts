import { Output, ToolLoopAgent } from "ai";
import { subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { PLANNER_INSTRUCTIONS } from "./instructions";
import { researchPlanSchema } from "./schemas";

export function buildPlannerAgent(opts: SubAgentOptions) {
  return new ToolLoopAgent({
    id: "planner",
    instructions: PLANNER_INSTRUCTIONS,
    output: Output.object({ schema: researchPlanSchema }),
    ...subAgentSettings(opts),
    stopWhen: subAgentStopWhen(3),
  });
}

export type PlannerAgent = ReturnType<typeof buildPlannerAgent>;
