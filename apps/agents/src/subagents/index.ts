import type { DeepPhase } from "@aqsha/agent-contracts";
import type { AgentsConfig } from "../config";
import { deepModelForAgent } from "../config";
import { LIST_VERIFY_TOOL_NAMES, qualifiedToolName } from "../agent/toolPolicy";

// Deep-research subagents (plan §5.5 + deep-research-verification-subagents-plan).
// The durable multi-phase orchestration runs the plan and write phases as the
// main agent; the literature, counter-evidence, and citation-verification
// phases each delegate to their OWN dedicated subagent. buildDeepResearchSubagents
// returns a per-phase map (keyed by DeepPhase) so a phase only ever receives its
// own subagent — never the others (keeps phase boundaries isolated). Structural
// type kept local so tests don't depend on SDK type exports.

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

export const RESEARCH_TOOLS = [
  t("searchWeb"),
  t("searchArxiv"),
  t("lookupDoi"),
  t("searchThreadDocuments"),
];

// Citation verification is list-based (no web search): the single verifier runs
// the integrity engine over the whole reference list in one batched tool call.
const VERIFY_TOOLS = LIST_VERIFY_TOOL_NAMES.map((name) => t(name));

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

export function buildCounterEvidenceAgents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Record<string, SubagentDefinition> {
  const deepModel = deepModelForAgent(input.config, input.agentKind);
  return {
    "counter-evidence": {
      description:
        "Adversarially searches for evidence AGAINST the emerging conclusions of an evidence " +
        "inventory — failed/non-replications, contradicting studies, methodological critiques, " +
        "retractions, dissenting reviews.",
      prompt: [
        "You are a counter-evidence researcher. You receive an evidence inventory whose conclusions are emerging.",
        "Search specifically for evidence that WEAKENS or contradicts those conclusions; prefer primary",
        "sources and systematic reviews, weight preprints lower and flag them.",
        "Limit yourself to ~3 search rounds; stop when disconfirming evidence saturates.",
        "For each finding: title, identifier (DOI/arXiv/URL), the [n] citation number from the tool result,",
        "a 2-4 sentence extract of HOW it cuts against the conclusion, and a strength rating (strong/medium/weak).",
        "Report honestly when you find none — the absence of rebuttal is itself a result; never fabricate opposition.",
        "Only report sources that came from tool results; keep the [n] numbers; never invent identifiers.",
      ].join(" "),
      tools: RESEARCH_TOOLS,
      model: deepModel,
      maxTurns: 8,
      // D3: delegate-then-consolidate needs the subagent's findings in-context
      // on the same turn — background:true is fire-and-forget (sdk.d.ts:77).
      background: false,
    },
  };
}

export function buildCitationVerifierAgents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Record<string, SubagentDefinition> {
  const deepModel = deepModelForAgent(input.config, input.agentKind);
  return {
    "citation-verifier": {
      description:
        "Verifies a list of collected references (existence, metadata consistency, DOI/arXiv validity) " +
        "without needing a finished document. Run ONE instance over the whole reference list.",
      prompt: [
        "You are a citation verifier. You receive a list of references (title, optional DOI/arXiv,",
        "authors, year, and each reference's [n] number).",
        "Call verifyIdentifiers ONCE with the full list (the 4-step integrity engine batches server-side);",
        "do not verify one-by-one and do not search the web.",
        "Return a per-reference verdict table keyed by the original [n]: status (verified / metadata",
        "mismatch / identifier invalid / not found / unverifiable), the specific issues, and the matched title.",
        "Neutral framing — a flag is not an accusation; recommend manual review for anything uncertain.",
        "Keep the [n] numbers exactly.",
      ].join(" "),
      // Intentionally narrower than counter/literature: list verification only.
      tools: VERIFY_TOOLS,
      model: deepModel,
      // 1 batched call + write-up, +1 margin if the model splits the list.
      maxTurns: 5,
      background: false, // D3
    },
  };
}

// Per-phase subagent map: each deep phase that delegates receives ONLY its own
// subagent. Keyed by DeepPhase and indexed [phase] in runManager — never
// flat-mapped, which would leak the verifiers into the literature phase.
export function buildDeepResearchSubagents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Partial<Record<DeepPhase, Record<string, SubagentDefinition>>> {
  return {
    literature: buildLiteratureSearcherAgents(input),
    counter_evidence: buildCounterEvidenceAgents(input),
    citation_verify: buildCitationVerifierAgents(input),
  };
}
