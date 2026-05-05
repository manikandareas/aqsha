export const SUB_AGENT_NAMES = ["planner", "searcher", "reader", "synthesizer", "critic"] as const;

export type SubAgentName = (typeof SUB_AGENT_NAMES)[number];

export const RESEARCH_TOOL_PREFIX = "research_";

export const RESEARCH_TOOL_TO_AGENT: Record<string, SubAgentName> = {
  research_planner: "planner",
  research_searcher: "searcher",
  research_reader: "reader",
  research_synthesizer: "synthesizer",
  research_critic: "critic",
};

export function subAgentForToolName(toolName: string | null | undefined): SubAgentName | null {
  if (!toolName) {
    return null;
  }

  return RESEARCH_TOOL_TO_AGENT[toolName] ?? null;
}
