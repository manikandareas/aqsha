import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { env } from "../../config";

export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
export const EXA_MCP_ALLOWED_TOOLS = ["web_search_exa", "web_fetch_exa"] as const;
export const EXA_MCP_TIMEOUT_MS = 30_000;

type ExaMcpToolName = (typeof EXA_MCP_ALLOWED_TOOLS)[number];

type ExaMcpClient = {
  tools: () => Promise<unknown>;
  close: () => Promise<void>;
};

type CreateMCPClient = (config: Parameters<typeof createMCPClient>[0]) => Promise<ExaMcpClient>;

type ExaMcpToolsOptions = {
  apiKey?: string;
  createClient?: CreateMCPClient;
};

export type ExaMcpTools = {
  tools: Partial<Record<ExaMcpToolName, ToolSet[string]>>;
  close: () => Promise<void>;
};

export async function createExaMcpTools({
  apiKey = env.ASTRA_EXA_API_KEY,
  createClient = createMCPClient,
}: ExaMcpToolsOptions = {}): Promise<ExaMcpTools> {
  if (!apiKey) {
    return { tools: {}, close: async () => {} };
  }

  const url = new URL(EXA_MCP_URL);
  url.searchParams.set("tools", EXA_MCP_ALLOWED_TOOLS.join(","));

  const client = await createClient({
    transport: {
      type: "http",
      url: url.toString(),
      headers: { "x-api-key": apiKey },
      redirect: "error",
    },
  });

  let closed = false;
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    await client.close();
  };

  try {
    const mcpTools = (await client.tools()) as ToolSet;
    return {
      tools: filterAllowedExaTools(mcpTools),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function filterAllowedExaTools(tools: ToolSet): Partial<Record<ExaMcpToolName, ToolSet[string]>> {
  const filtered: Partial<Record<ExaMcpToolName, ToolSet[string]>> = {};

  for (const toolName of EXA_MCP_ALLOWED_TOOLS) {
    if (tools[toolName]) {
      filtered[toolName] = tools[toolName];
    }
  }

  return filtered;
}

export type { MCPClient };
