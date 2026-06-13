import type { AgentsConfig } from "../config";
import type { InteractionBroker } from "../agent/interactions";
import type { ProviderDeps } from "../providers/types";
import type { AgentStore } from "../store/types";
import type { SandboxService } from "./sandboxService";

// Per-run context closed over by every aqsha MCP tool handler (plan §5.1):
// identity, store access, provider deps, the HITL broker, and the shared
// per-turn citation counter.

export type RunToolContext = {
  runId: string;
  threadId: string;
  ownerUserId: string;
  store: AgentStore;
  providers: ProviderDeps;
  broker: InteractionBroker;
  sandbox: SandboxService;
  config: AgentsConfig;
  nextCitationNumber: () => number;
};

export function createCitationCounter(): () => number {
  let counter = 0;
  return () => {
    counter += 1;
    return counter;
  };
}

/** Standard text tool result (the SDK CallToolResult content shape). */
export function textResult(text: string): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text }] };
}

/** JSON payload returned to the model as text. */
export function jsonResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return textResult(JSON.stringify(value, null, 2));
}

export function errorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}
