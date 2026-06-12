import type { ModelMessage } from "ai";

// AUD-01 — hard gate for executeArtifact (defense in depth atop the activeTools
// allow-list). executeArtifact WRITES a workspace artifact, so it must only be
// reachable AFTER the user approved a proposeArtifact. The allow-list withholds it
// from the initial turn; on a HITL resume the whole toolset is open (so an approved
// proposeArtifact can be followed by the write), which means an unrelated resume
// (an askUser answer, a runComputation approval) would otherwise leave
// executeArtifact reachable with no approved proposal. This per-step gate closes
// that window: executeArtifact is kept out of the step's active tools until an
// approved proposeArtifact appears in the conversation. Pure → unit-testable.

export const PROPOSE_ARTIFACT_TOOL = "proposeArtifact";
export const EXECUTE_ARTIFACT_TOOL = "executeArtifact";

// An approved proposeArtifact leaves a tool-call (the model's request) AND, once
// approved, a tool-result (its display-only execute) in the conversation. Either
// is sufficient evidence the proposal exists; we scan every message's content
// parts for a proposeArtifact tool-call/tool-result.
export function hasApprovedArtifactProposal(messages: ModelMessage[]): boolean {
  for (const message of messages) {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const type = (part as { type?: unknown }).type;
      const toolName = (part as { toolName?: unknown }).toolName;
      if (
        toolName === PROPOSE_ARTIFACT_TOOL &&
        (type === "tool-call" || type === "tool-result")
      ) {
        return true;
      }
    }
  }
  return false;
}

// Build a prepareStep callback that withholds executeArtifact from each step until
// an approved proposeArtifact is present. `toolNames` is the full active toolset
// (Object.keys(tools)); when a proposal exists we return no override (all tools
// stay active), otherwise we restrict the step to every tool EXCEPT executeArtifact.
export function buildExecuteArtifactGate(
  toolNames: string[],
): (options: { messages: ModelMessage[] }) => {
  activeTools?: string[];
} {
  const withoutExecute = toolNames.filter((name) => name !== EXECUTE_ARTIFACT_TOOL);
  return ({ messages }) =>
    hasApprovedArtifactProposal(messages) ? {} : { activeTools: withoutExecute };
}
