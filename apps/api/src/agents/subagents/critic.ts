import { Output, ToolLoopAgent } from "ai";
import { subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { CRITIC_INSTRUCTIONS } from "./instructions";
import { criticSchema } from "./schemas";

export function buildCriticAgent(opts: SubAgentOptions) {
  return new ToolLoopAgent({
    id: "critic",
    instructions: CRITIC_INSTRUCTIONS,
    output: Output.object({ schema: criticSchema }),
    ...subAgentSettings(opts),
    stopWhen: subAgentStopWhen(15),
  });
}

export type CriticAgent = ReturnType<typeof buildCriticAgent>;
