import type { AgentsConfig } from "../config";
import { chatModelForAgent, deepModelForAgent } from "../config";
import type { SubagentDefinition } from "../subagents";
import { deepResearchInstructions, instructionsForKind } from "./systemPrompt";
import {
  allowedToolsForTurn,
  DISALLOWED_BUILTIN_TOOLS,
  type TurnPhase,
} from "./toolPolicy";

// Builds the SDK query() options for one Astra turn (plan §4.2 astra.ts).
// The mcpServer instance, hooks, and canUseTool are run-scoped and passed in
// by the run manager; this module owns the per-tier policy: model, prompt,
// turn budget, allow-list, permission mode.

export type AstraTurnInput = {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
  mode: "normal" | "deep";
  phase: TurnPhase;
  resumeSessionId?: string;
  mcpServer: unknown;
  hooks?: unknown;
  canUseTool?: unknown;
  agents?: Record<string, SubagentDefinition>;
  abortController?: AbortController;
};

// Structural options object compatible with the SDK's Options type. Kept as a
// plain record so unit tests can assert policy without loading the SDK.
export type AstraQueryOptions = Record<string, unknown>;

export function buildAstraQueryOptions(input: AstraTurnInput): AstraQueryOptions {
  const { config, agentKind, mode } = input;
  const isDeep = mode === "deep";

  const options: AstraQueryOptions = {
    model: isDeep
      ? deepModelForAgent(config, agentKind)
      : chatModelForAgent(config, agentKind),
    systemPrompt: isDeep ? deepResearchInstructions() : instructionsForKind(agentKind),
    maxTurns: isDeep
      ? config.maxTurns.deep
      : agentKind === "pro"
        ? config.maxTurns.pro
        : config.maxTurns.lite,
    allowedTools: allowedToolsForTurn({ phase: input.phase, mode }),
    disallowedTools: [...DISALLOWED_BUILTIN_TOOLS],
    // Never bypassPermissions (it ignores allowedTools — plan §4.4 footgun).
    permissionMode: "default",
    mcpServers: { aqsha: input.mcpServer },
    // Project settings only: .claude/skills under appRoot; no user/local
    // settings from the host machine leak into the service.
    settingSources: ["project"],
    cwd: config.appRoot,
    includePartialMessages: true,
  };

  if (agentKind === "pro" && config.proMaxThinkingTokens) {
    // "Max effort" for reasoning models behind an Anthropic-compatible
    // gateway: the thinking budget maps to the provider's reasoning effort.
    options.maxThinkingTokens = config.proMaxThinkingTokens;
  }
  if (input.resumeSessionId) {
    options.resume = input.resumeSessionId;
  }
  if (input.hooks) {
    options.hooks = input.hooks;
  }
  if (input.canUseTool) {
    options.canUseTool = input.canUseTool;
  }
  if (input.agents) {
    options.agents = input.agents;
  }
  if (input.abortController) {
    options.abortController = input.abortController;
  }
  return options;
}
