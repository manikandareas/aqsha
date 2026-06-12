// Tool-name policy: which aqsha MCP tools each turn may use (port of the
// legacy activeTools allow-list + hitlToolNames.ts, adapted to SDK naming).

export const AQSHA_MCP_SERVER = "aqsha";

/** Fully-qualified SDK name for an aqsha tool ("mcp__aqsha__<name>"). */
export function qualifiedToolName(name: string): string {
  return `mcp__${AQSHA_MCP_SERVER}__${name}`;
}

/** Strip the MCP prefix back to the logical tool name. */
export function logicalToolName(qualified: string): string {
  const prefix = `mcp__${AQSHA_MCP_SERVER}__`;
  return qualified.startsWith(prefix) ? qualified.slice(prefix.length) : qualified;
}

export const RESEARCH_TOOL_NAMES = [
  "searchWeb",
  "searchArxiv",
  "lookupDoi",
  "searchThreadDocuments",
] as const;

export const CITATION_TOOL_NAMES = ["verifyCitations"] as const;

export const SANDBOX_AUTO_TOOL_NAMES = ["verifyStatistics"] as const;
export const SANDBOX_GATED_TOOL_NAMES = ["runComputation"] as const;

// Tools offered on the initial turn. `executeArtifact` is intentionally
// excluded so the model cannot write an artifact without an approved
// `proposeArtifact` first (defense layer 1 of the double gate).
export const HITL_INITIAL_TOOL_NAMES = [
  "askUser",
  "proposeArtifact",
  "deleteArtifact",
  "createWorkspace",
  "renameWorkspace",
] as const;

export const EXECUTE_ARTIFACT_TOOL_NAME = "executeArtifact";

// Tools that require a tool_approval interaction via canUseTool (plan §5.3).
export const APPROVAL_GATED_TOOL_NAMES = [
  "proposeArtifact",
  "deleteArtifact",
  "createWorkspace",
  "renameWorkspace",
  "runComputation",
] as const;

export const APPROVAL_GATED_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  APPROVAL_GATED_TOOL_NAMES,
);

// Built-in Claude Code tools the service never exposes (plan §4.4): no
// filesystem or shell access in production; the model works through the aqsha
// MCP server only. The Agent tool is allowed only in deep mode for subagents.
export const DISALLOWED_BUILTIN_TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "NotebookEdit",
  "WebSearch",
  "WebFetch",
] as const;

export type TurnPhase = "initial" | "resume_after_approval";

export function allowedToolsForTurn(input: {
  phase: TurnPhase;
  mode: "normal" | "deep";
}): string[] {
  const logical: string[] = [
    ...RESEARCH_TOOL_NAMES,
    ...CITATION_TOOL_NAMES,
    ...SANDBOX_AUTO_TOOL_NAMES,
    ...SANDBOX_GATED_TOOL_NAMES,
    ...HITL_INITIAL_TOOL_NAMES,
  ];
  if (input.phase === "resume_after_approval") {
    logical.push(EXECUTE_ARTIFACT_TOOL_NAME);
  }
  const allowed = logical.map(qualifiedToolName);
  if (input.mode === "deep") {
    // Subagent delegation runs through the built-in Agent tool.
    allowed.push("Agent");
  }
  return allowed;
}
