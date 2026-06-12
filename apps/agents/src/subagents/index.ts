import type { AgentsConfig } from "../config";
import { deepModelForAgent } from "../config";
import { qualifiedToolName } from "../agent/toolPolicy";

// Deep-research subagents (plan §5.5). Since the durable multi-phase
// orchestration (Step 4) runs planner/counter-evidence/citation-verify/writer
// as isolated main-agent PHASES, the only remaining subagent is the parallel
// literature-searcher used inside the literature phase. Structural type kept
// local so tests don't depend on SDK type exports.

export type SubagentDefinition = {
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
  maxTurns?: number;
  skills?: string[];
  background?: boolean;
};

const t = qualifiedToolName;

const RESEARCH_TOOLS = [
  t("searchWeb"),
  t("searchArxiv"),
  t("lookupDoi"),
  t("searchThreadDocuments"),
];

export function buildLiteratureSearcherAgents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Record<string, SubagentDefinition> {
  const deepModel = deepModelForAgent(input.config, input.agentKind);
  const maxRounds = input.agentKind === "pro" ? 4 : 2;

  return {
    "literature-searcher": {
      description:
        "Searches the literature for one sub-question and extracts the strongest evidence with citations. Run one per sub-question; independent sub-questions may run in parallel.",
      prompt: [
        "You are a literature searcher. You receive one sub-question.",
        "Search with the research tools, prefer primary sources, and extract the strongest evidence.",
        "Return: for each useful source — title, identifier (DOI/arXiv/URL), citation number [n] from the tool result, a 2-4 sentence evidence extract, and an evidence-strength rating (strong/medium/weak).",
        `Limit yourself to ~${maxRounds} search rounds; stop early when evidence saturates.`,
        "Only report sources that came from tool results; never invent identifiers.",
      ].join(" "),
      tools: RESEARCH_TOOLS,
      model: deepModel,
      maxTurns: 8,
      background: true,
    },
  };
}
