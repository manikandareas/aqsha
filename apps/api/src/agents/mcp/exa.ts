import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { env } from "../../config";
import type { AgentUsedSource } from "../../modules/agents/model";

type UnknownRecord = Record<string, unknown>;
type SourceReporter = (source: AgentUsedSource) => Promise<void> | void;

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
  onSource?: SourceReporter;
};

export type ExaMcpTools = {
  tools: Partial<Record<ExaMcpToolName, ToolSet[string]>>;
  close: () => Promise<void>;
};

export async function createExaMcpTools({
  apiKey = env.ASTRA_EXA_API_KEY,
  createClient = createMCPClient,
  onSource,
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
    const tools = filterAllowedExaTools(mcpTools);

    return {
      tools: onSource ? wrapExaTools(tools, onSource) : tools,
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

function wrapExaTools(
  tools: Partial<Record<ExaMcpToolName, ToolSet[string]>>,
  onSource: SourceReporter,
): Partial<Record<ExaMcpToolName, ToolSet[string]>> {
  const wrapped: Partial<Record<ExaMcpToolName, ToolSet[string]>> = {};

  for (const toolName of EXA_MCP_ALLOWED_TOOLS) {
    const tool = tools[toolName];

    if (!tool?.execute) {
      if (tool) {
        wrapped[toolName] = tool;
      }
      continue;
    }

    const execute = tool.execute.bind(tool);
    wrapped[toolName] = {
      ...tool,
      execute: async (input: unknown, options: Parameters<typeof execute>[1]) => {
        const output = await execute(input as never, options);
        await reportExaToolSources(toolName, output, onSource);
        return output;
      },
    } as ToolSet[string];
  }

  return wrapped;
}

async function reportExaToolSources(
  toolName: ExaMcpToolName,
  output: unknown,
  onSource: SourceReporter,
) {
  for (const source of extractExaSources(output, toolName)) {
    try {
      await onSource(source);
    } catch (error) {
      logExaSourceError("Failed to report Exa MCP source", source, error);
    }
  }
}

function extractExaSources(value: unknown, toolName: ExaMcpToolName): AgentUsedSource[] {
  const sources: AgentUsedSource[] = [];
  const seen = new Set<string>();

  for (const source of collectExaSources(parseJsonString(value), toolName, 0)) {
    if (!source.url || seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);
    sources.push(source);
  }

  return sources;
}

function collectExaSources(value: unknown, toolName: ExaMcpToolName, depth: number): AgentUsedSource[] {
  if (depth > 5) {
    return [];
  }

  const parsed = parseJsonString(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => collectExaSources(item, toolName, depth + 1));
  }

  const record = asRecord(parsed);

  if (!record) {
    return typeof parsed === "string" ? extractSourcesFromExaText(parsed, toolName) : [];
  }

  const direct = sourceFromExaRecord(record, toolName);
  const contentTextSources = extractTextParts(record).flatMap((text) =>
    extractSourcesFromExaText(text, toolName),
  );
  const nested = ["results", "items", "content", "contents", "data", "documents"].flatMap((field) => {
    if (!(field in record)) {
      return [];
    }

    return collectExaSources(record[field], toolName, depth + 1);
  });

  return [direct, ...contentTextSources, ...nested].filter((source): source is AgentUsedSource => Boolean(source));
}

function sourceFromExaRecord(record: UnknownRecord, toolName: ExaMcpToolName): AgentUsedSource | null {
  const url = validUrl(stringValue(record.url));

  if (!url) {
    return null;
  }

  return {
    kind: "url",
    title: stringValue(record.title),
    url,
    providerSourceId: stringValue(record.id),
    metadata: exaMetadata(toolName, {
      publishedDate: stringValue(record.publishedDate),
      author: stringValue(record.author),
      summary: stringValue(record.summary),
    }),
  };
}

function extractTextParts(record: UnknownRecord): string[] {
  if (record.type === "text" && typeof record.text === "string") {
    return [record.text];
  }

  return [];
}

function extractSourcesFromExaText(text: string, toolName: ExaMcpToolName): AgentUsedSource[] {
  const blocks = text.split(/\n---\n/g);

  return blocks.flatMap((block) => {
    const url = validUrl(matchLine(block, "URL"));

    if (!url) {
      return [];
    }

    return [{
      kind: "url",
      title: matchLine(block, "Title"),
      url,
      providerSourceId: null,
      metadata: exaMetadata(toolName, {
        publishedDate: matchLine(block, "Published"),
        author: matchLine(block, "Author"),
      }),
    }];
  });
}

function matchLine(text: string, label: string): string | null {
  const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return stringValue(match?.[1]);
}

function exaMetadata(toolName: ExaMcpToolName, values: Record<string, string | null>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    source: "tool-result",
    toolName,
    provider: "exa",
  };

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function validUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function logExaSourceError(message: string, source: AgentUsedSource, error: unknown) {
  const payload: Record<string, unknown> = {
    level: "error",
    module: "agents.exa",
    message,
    sourceKind: source.kind,
    sourceUrl: source.url ?? null,
    providerSourceId: source.providerSourceId ?? null,
  };

  if (error instanceof Error) {
    payload.errorName = error.name;
    payload.errorMessage = error.message;
    payload.stack = error.stack;
  } else if (error !== undefined) {
    payload.error = error;
  }

  console.error(JSON.stringify(payload));
}

export type { MCPClient };
