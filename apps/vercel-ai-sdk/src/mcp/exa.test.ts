import { describe, expect, test } from "bun:test";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { mergeAstraTools } from "../agents/common";
import { createExaMcpTools } from "./exa";

describe("Exa MCP tools", () => {
  test("returns no tools without ASTRA_EXA_API_KEY", async () => {
    let created = false;

    const exa = await createExaMcpTools({
      apiKey: "",
      createClient: async () => {
        created = true;
        throw new Error("should not create MCP client");
      },
    });

    expect(created).toBe(false);
    expect(exa.tools).toEqual({});
    await expect(exa.close()).resolves.toBeUndefined();
  });

  test("sends x-api-key header and allowed tools query", async () => {
    let transport: unknown;

    await createExaMcpTools({
      apiKey: "exa-key",
      createClient: async (config) => {
        transport = config.transport;
        return fakeClient({});
      },
    });

    expect(transport).toMatchObject({
      type: "http",
      headers: { "x-api-key": "exa-key" },
      redirect: "error",
    });
    expect(new URL(String((transport as { url: string }).url)).searchParams.get("tools")).toBe(
      "web_search_exa,web_fetch_exa",
    );
  });

  test("filters MCP tools to the Exa allowlist", async () => {
    const allowedSearch = fakeTool("search");
    const allowedFetch = fakeTool("fetch");
    const rogue = fakeTool("rogue");

    const exa = await createExaMcpTools({
      apiKey: "exa-key",
      createClient: async () =>
        fakeClient({
          web_search_exa: allowedSearch,
          web_fetch_exa: allowedFetch,
          rogue,
        }),
    });

    expect(Object.keys(exa.tools).sort()).toEqual(["web_fetch_exa", "web_search_exa"]);
    expect(exa.tools.web_search_exa).toBe(allowedSearch);
    expect(exa.tools.web_fetch_exa).toBe(allowedFetch);
    expect((exa.tools as ToolSet).rogue).toBeUndefined();
  });

  test("rejects external tools that override local skill tools", () => {
    expect(() => mergeAstraTools({ loadSkill: fakeTool("local") }, { loadSkill: fakeTool("external") })).toThrow(
      "External tool cannot override local skill tool: loadSkill",
    );
  });
});

function fakeClient(tools: ToolSet) {
  return {
    serverInfo: { name: "fake", version: "1" },
    tools: async () => tools,
    listTools: async () => ({ tools: [] }),
    toolsFromDefinitions: () => tools,
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    listResourceTemplates: async () => ({ resourceTemplates: [] }),
    experimental_listPrompts: async () => ({ prompts: [] }),
    experimental_getPrompt: async () => ({ messages: [] }),
    onElicitationRequest: () => {},
    close: async () => {},
  };
}

function fakeTool(result: string): ToolSet[string] {
  return tool({
    description: result,
    inputSchema: z.object({}),
    execute: async () => result,
  }) as ToolSet[string];
}
