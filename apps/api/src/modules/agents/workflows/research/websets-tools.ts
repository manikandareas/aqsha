import { env } from "../../../../config";

export function createWebsetsMcpServers() {
  if (!env.EXA_API_KEY) {
    return {};
  }

  return {
    websets: {
      type: "stdio" as const,
      command: "npx",
      args: [
        "-y",
        "mcp-remote",
        `https://websetsmcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(
          env.EXA_API_KEY,
        )}`,
      ],
      tools: [
        { name: "create_webset", permission_policy: "always_allow" as const },
        { name: "list_websets", permission_policy: "always_allow" as const },
        { name: "get_webset", permission_policy: "always_allow" as const },
        { name: "update_webset", permission_policy: "always_allow" as const },
        {
          name: "list_webset_items",
          permission_policy: "always_allow" as const,
        },
        { name: "get_item", permission_policy: "always_allow" as const },
        { name: "create_search", permission_policy: "always_allow" as const },
        { name: "get_search", permission_policy: "always_allow" as const },
        { name: "cancel_search", permission_policy: "always_allow" as const },
        {
          name: "create_enrichment",
          permission_policy: "always_allow" as const,
        },
        {
          name: "get_enrichment",
          permission_policy: "always_allow" as const,
        },
        {
          name: "delete_enrichment",
          permission_policy: "always_allow" as const,
        },
        {
          name: "cancel_enrichment",
          permission_policy: "always_allow" as const,
        },
      ],
    },
  };
}

export const allowedWebsetsTools = [
  "mcp__websets__create_webset",
  "mcp__websets__list_websets",
  "mcp__websets__get_webset",
  "mcp__websets__update_webset",
  "mcp__websets__list_webset_items",
  "mcp__websets__get_item",
  "mcp__websets__create_search",
  "mcp__websets__get_search",
  "mcp__websets__cancel_search",
  "mcp__websets__create_enrichment",
  "mcp__websets__get_enrichment",
  "mcp__websets__delete_enrichment",
  "mcp__websets__cancel_enrichment",
] as const;
