import type { AgentsConfig } from "../config";
import { deepModelForAgent } from "../config";
import { qualifiedToolName } from "../agent/toolPolicy";

// Deep-research subagents (plan §5.5) as programmatic AgentDefinitions. The
// orchestrator (main agent in deep mode) delegates by description; literature
// searchers run in parallel via background mode. Structural type kept local so
// tests don't depend on SDK type exports.

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

export function buildDeepResearchAgents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
  writerSkill: string | null;
}): Record<string, SubagentDefinition> {
  const deepModel = deepModelForAgent(input.config, input.agentKind);
  const maxRounds = input.agentKind === "pro" ? 4 : 2;

  return {
    planner: {
      description:
        "Decomposes a deep-research question into 3-6 focused sub-questions with search strategies. Use FIRST, before any literature search.",
      prompt:
        "You are the research planner. Decompose the research question into 3-6 focused, independently searchable sub-questions. For each: the sub-question, the best search strategy (web / arXiv / DOI lookup), and expected evidence types. Return the plan as structured Markdown. Do not perform searches yourself.",
      tools: [],
      model: deepModel,
      maxTurns: 3,
    },
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
    "counter-evidence": {
      description:
        "Adversarial pass: searches specifically for evidence AGAINST the emerging conclusion. Use after the literature rounds.",
      prompt:
        "You are the counter-evidence searcher. You receive the emerging conclusion and key claims. Search specifically for disconfirming evidence: failed replications, contradicting studies, critiques, retractions. Report what you find with the same citation discipline as the literature searcher; report honestly when you find none.",
      tools: RESEARCH_TOOLS,
      model: deepModel,
      maxTurns: 6,
    },
    "citation-verifier": {
      description:
        "Verifies every citation collected during the run (existence, metadata, identifier validity). Use before the writer.",
      prompt:
        "You are the citation verifier. For the document or citation list you are given, run the verifyCitations tool (preferred) or check identifiers individually with lookupDoi/searchArxiv. Report per-reference verdicts with neutral framing: a flag is not an accusation — recommend manual review.",
      tools: [t("verifyCitations"), t("lookupDoi"), t("searchArxiv")],
      model: deepModel,
      maxTurns: 5,
    },
    writer: {
      description:
        "Synthesizes the final research report from the collected evidence. Use LAST, after verification.",
      prompt: [
        "You are the report writer. Synthesize the collected evidence into a rigorous, well-structured research report in Markdown.",
        "Every factual claim carries a [n] citation marker that maps to a verified source from this run.",
        "Include: an executive summary, findings per sub-question, counter-evidence and limitations, and a references list.",
        "State evidence strength explicitly and keep disagreements between sources visible.",
      ].join(" "),
      tools: [t("searchThreadDocuments")],
      model: deepModel,
      maxTurns: 6,
      skills: input.writerSkill ? [input.writerSkill] : undefined,
    },
  };
}
