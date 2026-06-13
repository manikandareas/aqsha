import { isApproved } from "@aqsha/agent-contracts";
import type { AgentStore } from "../store/types";
import {
  EXECUTE_ARTIFACT_TOOL_NAME,
  logicalToolName,
  qualifiedToolName,
} from "./toolPolicy";

// SDK hooks for one run (plan §4.2 hooks.ts): the executeArtifact hard gate
// (defense layer 2 — layer 1 is the allow-list) plus run-event instrumentation.
// Hook inputs/outputs are typed structurally to stay decoupled from SDK type
// names; the shapes match the documented hook contract.

type HookInputLike = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  // Subagent + compaction events carry extra fields; captured loosely.
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

export function buildRunHooks(input: {
  store: AgentStore;
  runId: string;
  threadId: string;
}): RunHooks {
  const { store, runId, threadId } = input;

  const preToolUse: HookCallbackLike = async (hookInput) => {
    const toolName = hookInput.tool_name ?? "";
    const logical = logicalToolName(toolName);
    await store.appendRunEvent({
      runId,
      type: "tool_start",
      payload: { toolName: logical },
    });
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

  const postToolUse: HookCallbackLike = async (hookInput) => {
    await store.appendRunEvent({
      runId,
      type: "tool_end",
      payload: { toolName: logicalToolName(hookInput.tool_name ?? "") },
    });
    return {};
  };

  const subagentStart: HookCallbackLike = async (hookInput) => {
    await store.appendRunEvent({
      runId,
      type: "subagent_start",
      payload: {
        agentType: stringField(hookInput, "agent_type", "subagent_type", "agentType"),
      },
    });
    return {};
  };

  const subagentStop: HookCallbackLike = async (hookInput) => {
    await store.appendRunEvent({
      runId,
      type: "subagent_stop",
      payload: {
        agentType: stringField(hookInput, "agent_type", "subagent_type", "agentType"),
      },
    });
    return {};
  };

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
