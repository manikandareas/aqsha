import { Output, ToolLoopAgent, type ToolSet } from "ai";
import { pickTools, subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { SEARCHER_INSTRUCTIONS } from "./instructions";
import { searchResultsSchema } from "./schemas";

type SearcherOptions = SubAgentOptions & { exaTools: ToolSet };

export function buildSearcherAgent(opts: SearcherOptions) {
  const tools = pickTools(opts.exaTools, ["web_search_exa"]);
  return new ToolLoopAgent({
    id: "searcher",
    instructions: SEARCHER_INSTRUCTIONS,
    output: Output.object({ schema: searchResultsSchema }),
    ...subAgentSettings({
      model: opts.model,
      providerOptions: opts.providerOptions,
      context: opts.context,
      externalTools: tools,
    }),
    stopWhen: subAgentStopWhen(6),
  });
}

export type SearcherAgent = ReturnType<typeof buildSearcherAgent>;
