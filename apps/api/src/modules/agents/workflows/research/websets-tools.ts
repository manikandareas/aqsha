import { MCPServerStreamableHttp } from "@openai/agents";
import { env } from "../../../../config";

/**
 * Websets MCP server (Exa). Returns a single streamable-HTTP MCP server the
 * OpenAI Agents SDK can merge into the researcher's tool surface, or null if
 * EXA_API_KEY is not configured.
 *
 * Caller is responsible for lifecycle: call `server.connect()` before passing
 * it to `Agent.mcpServers` and `server.close()` once the phase completes.
 */
export function createWebsetsMcpServer(): MCPServerStreamableHttp | null {
  if (!env.EXA_API_KEY) {
    return null;
  }

  const url = `https://websetsmcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(
    env.EXA_API_KEY,
  )}`;

  return new MCPServerStreamableHttp({
    url,
    name: "aqsha-websets",
  });
}

/**
 * Names of Websets tools the researcher is expected to use. Kept here for
 * documentation; MCP tools are auto-discovered from `server.listTools()`.
 */
export const websetsToolNames = [
  "create_webset",
  "list_websets",
  "get_webset",
  "update_webset",
  "list_webset_items",
  "get_item",
  "create_search",
  "get_search",
  "cancel_search",
  "create_enrichment",
  "get_enrichment",
  "delete_enrichment",
  "cancel_enrichment",
] as const;
