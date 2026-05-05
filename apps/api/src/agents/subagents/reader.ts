import { Output, ToolLoopAgent, type ToolSet } from "ai";
import { pickTools, subAgentSettings, subAgentStopWhen, type SubAgentOptions } from "./common";
import { READER_INSTRUCTIONS } from "./instructions";
import { evidenceCardsSchema } from "./schemas";

type ReaderOptions = SubAgentOptions & {
  exaTools: ToolSet;
  /** Phase 2: fetch_url (Readability) + pdf_extract for fallback / PDF sources. */
  researchTools: ToolSet;
};

export function buildReaderAgent(opts: ReaderOptions) {
  const tools: ToolSet = {
    ...pickTools(opts.exaTools, ["web_fetch_exa"]),
    ...pickTools(opts.researchTools, ["fetch_url", "pdf_extract"]),
  };
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
    // Bumped from 8 → 10 to allow fallback chain (exa → fetch_url → pdf_extract).
    stopWhen: subAgentStopWhen(10),
  });
}

export type ReaderAgent = ReturnType<typeof buildReaderAgent>;
