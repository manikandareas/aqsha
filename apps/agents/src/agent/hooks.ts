import {
  isApproved,
  type SubagentPayload,
  type ToolEndPayload,
  type ToolStartPayload,
} from "@aqsha/agent-contracts";
import type { AgentStore } from "../store/types";
import {
  sanitizeToolInput,
  sanitizeToolResult,
  toolResponseIsError,
} from "./activitySanitizers";
import type { SegmentCoordinator } from "./segmentCoordinator";
import {
  EXECUTE_ARTIFACT_TOOL_NAME,
  logicalToolName,
  qualifiedToolName,
} from "./toolPolicy";

// SDK hooks for one run (plan §4.2 hooks.ts): the executeArtifact hard gate
// (defense layer 2 — layer 1 is the allow-list) plus run-event instrumentation.
// Hook inputs/outputs are typed structurally to stay decoupled from SDK type
// names; the shapes match the documented hook contract.
//
// Fase 2 (plan §7–§8): tool events now carry the SDK `tool_use_id` (exact
// pairing of start↔end in the view-model), a SANITIZED input/result summary,
// and an explicit ok/error status; subagent events carry `agent_id`. All detail
// flows through `activitySanitizers.ts` first — raw inputs/responses never reach
// the payload.
//
// Fase 3 (plan §6): tool events also carry `parentAgentId` — the SDK
// `BaseHookInput.agent_id`, which is set ONLY when a hook fires from inside a
// sub-agent (an AgentTool worker). The literature-searcher sub-agent already
// uses aqsha MCP tools, so its tool calls already match this matcher and already
// fire here; we simply read the agent_id the SDK supplies so the view-model can
// nest each sub-agent's tools precisely — correct even when sub-agents run in
// parallel (where a seq-window heuristic cannot be). No matcher widening: the
// built-in Agent/Task spawn is already represented by the subagent_start node,
// and emitting it as a tool too would duplicate that node.

type HookInputLike = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  // PostToolUse carries the tool result; PostToolUseFailure carries `error`.
  tool_response?: unknown;
  tool_use_id?: string;
  // SubagentStart/Stop carry `agent_id`; compaction carries trigger fields.
  agent_id?: string;
  [key: string]: unknown;
};

type HookOutputLike = {
  continue?: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
  };
};

type HookCallbackLike = (
  input: HookInputLike,
  toolUseID: string | undefined,
  context: { signal: AbortSignal },
) => Promise<HookOutputLike>;

export type HookMatcherLike = { matcher?: string; hooks: HookCallbackLike[] };
export type RunHooks = Record<string, HookMatcherLike[]>;

/**
 * Verify there is an approved proposeArtifact interaction in this thread that
 * matches the executeArtifact call (same artifactId for updates; any approved
 * create-proposal for creates), and that no executeArtifact already consumed it.
 */
export async function executeArtifactGateAllows(
  store: AgentStore,
  threadId: string,
  toolInput: Record<string, unknown>,
): Promise<{ allowed: boolean; reason?: string }> {
  const interactions = await store.listInteractions(threadId);
  const approvedProposals = interactions.filter(
    (interaction) =>
      interaction.toolName === "proposeArtifact" && isApproved(interaction),
  );
  if (approvedProposals.length === 0) {
    return {
      allowed: false,
      reason:
        "executeArtifact requires an approved proposeArtifact in this thread first.",
    };
  }
  const targetArtifactId =
    typeof toolInput.artifactId === "string" ? toolInput.artifactId : undefined;
  const action = typeof toolInput.action === "string" ? toolInput.action : undefined;
  if (action === "update" && targetArtifactId) {
    const match = approvedProposals.some((interaction) => {
      const proposed = interaction.payload as { artifactId?: unknown };
      return proposed.artifactId === targetArtifactId;
    });
    if (!match) {
      return {
        allowed: false,
        reason: `No approved proposeArtifact found for artifact ${targetArtifactId}.`,
      };
    }
  }
  return { allowed: true };
}

// Safety net for the ordering barrier: a main-thread tool waits at most this
// long for the bridge to close the preceding answer segment before it records
// its tool_start anyway (the bridge normally releases within a few ms; this only
// trips on a dropped message or a cancelled run).
const SEGMENT_BARRIER_TIMEOUT_MS = 3_000;

export function buildRunHooks(input: {
  store: AgentStore;
  runId: string;
  threadId: string;
  /**
   * Answer-stream Fase 1 ordering barrier. When present, a MAIN-THREAD tool's
   * PreToolUse waits for the bridge to close the preceding segment before it
   * records tool_start, so `seq(segment) < seq(tool_start)` despite the SDK's
   * eager message production. Omitted in dev/tests that don't assert ordering.
   */
  coordinator?: SegmentCoordinator;
}): RunHooks {
  const { store, runId, threadId, coordinator } = input;

  const preToolUse: HookCallbackLike = async (hookInput, toolUseID, context) => {
    const toolName = hookInput.tool_name ?? "";
    const logical = logicalToolName(toolName);
    const toolUseId = toolUseID ?? hookInput.tool_use_id;
    const parentAgentId = stringField(hookInput, "agent_id", "agentId");
    // Main-thread tools order behind their preceding answer segment; sub-agent
    // tools (parentAgentId set) nest under the sub-agent node, not the main
    // timeline, so they never wait on a main-thread segment. The abort signal
    // (fired on cancel) bails the wait early so a cancelled run records no late
    // tool_start.
    if (coordinator && !parentAgentId) {
      await coordinator.awaitSegmentClosed(
        toolUseId,
        SEGMENT_BARRIER_TIMEOUT_MS,
        context?.signal,
      );
    }
    const inputSummary = sanitizeToolInput(logical, hookInput.tool_input);
    const payload: ToolStartPayload = { toolName: logical };
    if (toolUseId) payload.toolUseId = toolUseId;
    if (parentAgentId) payload.parentAgentId = parentAgentId;
    if (Object.keys(inputSummary).length > 0) payload.inputSummary = inputSummary;
    await store.appendRunEvent({ runId, type: "tool_start", payload });
    if (logical === EXECUTE_ARTIFACT_TOOL_NAME) {
      const gate = await executeArtifactGateAllows(
        store,
        threadId,
        hookInput.tool_input ?? {},
      );
      if (!gate.allowed) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: gate.reason,
          },
        };
      }
    }
    return {};
  };

  const postToolUse: HookCallbackLike = async (hookInput, toolUseID) => {
    const logical = logicalToolName(hookInput.tool_name ?? "");
    const isError = toolResponseIsError(hookInput.tool_response);
    const payload: ToolEndPayload = {
      toolName: logical,
      status: isError ? "error" : "ok",
    };
    const toolUseId = toolUseID ?? hookInput.tool_use_id;
    if (toolUseId) payload.toolUseId = toolUseId;
    const parentAgentId = stringField(hookInput, "agent_id", "agentId");
    if (parentAgentId) payload.parentAgentId = parentAgentId;
    // An error result is just a message, not data — skip the result summary.
    const resultSummary = isError
      ? {}
      : sanitizeToolResult(logical, hookInput.tool_response);
    if (Object.keys(resultSummary).length > 0) payload.resultSummary = resultSummary;
    await store.appendRunEvent({ runId, type: "tool_end", payload });
    return {};
  };

  // A tool that threw mid-execution: close its timeline node as failed. The raw
  // `error` string is deliberately dropped (it can carry a stack/path/secret) —
  // the view-model derives a safe "Gagal …" title from the tool name.
  const postToolUseFailure: HookCallbackLike = async (hookInput, toolUseID) => {
    const payload: ToolEndPayload = {
      toolName: logicalToolName(hookInput.tool_name ?? ""),
      status: "error",
    };
    const toolUseId = toolUseID ?? hookInput.tool_use_id;
    if (toolUseId) payload.toolUseId = toolUseId;
    const parentAgentId = stringField(hookInput, "agent_id", "agentId");
    if (parentAgentId) payload.parentAgentId = parentAgentId;
    await store.appendRunEvent({ runId, type: "tool_end", payload });
    return {};
  };

  const subagentEvent =
    (type: "subagent_start" | "subagent_stop"): HookCallbackLike =>
    async (hookInput) => {
      const payload: SubagentPayload = {};
      const agentType = stringField(hookInput, "agent_type", "subagent_type", "agentType");
      if (agentType) payload.agentType = agentType;
      const agentId = stringField(hookInput, "agent_id", "agentId");
      if (agentId) payload.agentId = agentId;
      await store.appendRunEvent({ runId, type, payload });
      return {};
    };

  const subagentStart = subagentEvent("subagent_start");
  const subagentStop = subagentEvent("subagent_stop");

  const preCompact: HookCallbackLike = async () => {
    await store.appendRunEvent({ runId, type: "compaction", payload: {} });
    return {};
  };

  return {
    PreToolUse: [
      { matcher: `^${qualifiedToolName("")}`, hooks: [preToolUse] },
    ],
    PostToolUse: [
      { matcher: `^${qualifiedToolName("")}`, hooks: [postToolUse] },
    ],
    PostToolUseFailure: [
      { matcher: `^${qualifiedToolName("")}`, hooks: [postToolUseFailure] },
    ],
    SubagentStart: [{ hooks: [subagentStart] }],
    SubagentStop: [{ hooks: [subagentStop] }],
    PreCompact: [{ hooks: [preCompact] }],
  };
}

function stringField(
  input: HookInputLike,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}
