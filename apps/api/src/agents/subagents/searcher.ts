import { Output, ToolLoopAgent, type ToolSet } from "ai";
import { pickTools, subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { SEARCHER_INSTRUCTIONS } from "./instructions";
import { searchResultsSchema } from "./schemas";

type SearcherOptions = SubAgentOptions & {
  exaTools: ToolSet;
  /** Phase 2: arxiv_search / crossref_search / pubmed_search / rerank_sources. */
  researchTools: ToolSet;
};

export function buildSearcherAgent(opts: SearcherOptions) {
  const tools: ToolSet = {
    ...pickTools(opts.exaTools, ["web_search_exa"]),
    ...pickTools(opts.researchTools, [
      "memory_recall",
      "arxiv_search",
      "crossref_search",
      "pubmed_search",
      "rerank_sources",
    ]),
  };
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
    // Bumped from 6 → 8 to allow fan-out across multiple providers + rerank.
    stopWhen: subAgentStopWhen(8),
  });
}

export type SearcherAgent = ReturnType<typeof buildSearcherAgent>;
