import { Output, ToolLoopAgent } from "ai";
import { subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { SYNTHESIZER_INSTRUCTIONS } from "./instructions";
import { synthesisSchema } from "./schemas";

export function buildSynthesizerAgent(opts: SubAgentOptions) {
  return new ToolLoopAgent({
    id: "synthesizer",
    instructions: SYNTHESIZER_INSTRUCTIONS,
    output: Output.object({ schema: synthesisSchema }),
    ...subAgentSettings(opts),
    stopWhen: subAgentStopWhen(4),
  });
}

export type SynthesizerAgent = ReturnType<typeof buildSynthesizerAgent>;
