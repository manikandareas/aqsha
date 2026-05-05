import { Output, ToolLoopAgent, type ToolSet } from "ai";
import { pickTools, subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { READER_INSTRUCTIONS } from "./instructions";
import { evidenceCardsSchema } from "./schemas";

type ReaderOptions = SubAgentOptions & { exaTools: ToolSet };

export function buildReaderAgent(opts: ReaderOptions) {
  const tools = pickTools(opts.exaTools, ["web_fetch_exa"]);
  return new ToolLoopAgent({
    id: "reader",
    instructions: READER_INSTRUCTIONS,
    output: Output.object({ schema: evidenceCardsSchema }),
    ...subAgentSettings({
      model: opts.model,
      providerOptions: opts.providerOptions,
      context: opts.context,
      externalTools: tools,
    }),
    stopWhen: subAgentStopWhen(8),
  });
}

export type ReaderAgent = ReturnType<typeof buildReaderAgent>;
