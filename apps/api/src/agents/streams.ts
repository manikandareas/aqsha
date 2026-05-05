import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { createAgentUIStream, createAgentUIStreamResponse, type LanguageModel, type ToolSet, type UIMessage } from "ai";
import type { AgentUsedSource } from "../modules/agents/model";
import type { MemoryService } from "../modules/memory/service";
import { buildAstraAgent } from "./astra";
import { phaseAwarePrepareStep, looksLikeResearchRequest } from "./loop-control";
import { createExaMcpTools } from "./mcp/exa";
import { resolveSubAgentModel } from "./model";
import { createSubAgentTools } from "./tools";
import { createArxivSearchTool } from "./tools/arxiv-search";
import { createCrossrefSearchTool } from "./tools/crossref-search";
import { createFetchUrlTool } from "./tools/fetch-url";
import { createPdfExtractTool } from "./tools/pdf-extract";
import { createPubmedSearchTool } from "./tools/pubmed-search";
import { createRerankSourcesTool } from "./tools/rerank-sources";
import type { AgentRuntimeContext } from "./types";

type UnknownRecord = Record<string, unknown>;
type SourceReporter = (source: AgentUsedSource) => Promise<void> | void;

const EXA_SOURCE_TOOL_NAMES = new Set(["web_search_exa", "web_fetch_exa"]);
const EXA_RESULT_CONTAINERS = ["results", "items", "content", "contents", "data", "documents"];
const EXA_METADATA_FIELDS = ["publishedDate", "author", "summary"];
const MAX_EXA_SOURCE_DEPTH = 5;

/** Phase 2 discovery tools whose outputs follow `{ provider, candidates: [...] }`. */
const RESEARCH_DISCOVERY_TOOL_NAMES = new Set([
  "arxiv_search",
  "crossref_search",
  "pubmed_search",
  "memory_recall",
]);

type StreamCommonOptions = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
  memoryService?: MemoryService;
};

export async function createAstraAgentUIStream(opts: StreamCommonOptions) {
  const external = await createAstraExternalTools();
  try {
    const subAgentTools = createSubAgentTools({
      context: opts.context,
      exaTools: external.exa,
      researchTools: external.research,
      defaultModel: opts.model,
      defaultProviderOptions: opts.providerOptions,
      memoryService: opts.memoryService,
      ...resolveSubAgentRoleModels(opts),
    });

    const isResearch = looksLikeResearchRequest(opts.uiMessages);

    const stream = await createAgentUIStream({
      agent: buildAstraAgent({
        model: opts.model,
        providerOptions: opts.providerOptions,
        context: opts.context,
        externalTools: { ...subAgentTools, ...external.exa } as ToolSet,
        prepareStep: phaseAwarePrepareStep({ isResearch }),
      }),
      uiMessages: opts.uiMessages,
      abortSignal: opts.abortSignal,
    });

    return stream.pipeThrough(createCleanupStream(external.close));
  } catch (error) {
    await external.close();
    throw error;
  }
}

export async function createAstraAgentResponse({
  model,
  providerOptions,
  context,
  uiMessages,
  abortSignal,
  headers,
  onSource,
  memoryService,
}: StreamCommonOptions & {
  headers?: HeadersInit;
  onSource?: SourceReporter;
}) {
  const external = await createAstraExternalTools({ onSource });
  try {
    const subAgentTools = createSubAgentTools({
      context,
      exaTools: external.exa,
      researchTools: external.research,
      defaultModel: model,
      defaultProviderOptions: providerOptions,
      memoryService,
      ...resolveSubAgentRoleModels({ model, providerOptions }),
    });

    const isResearch = looksLikeResearchRequest(uiMessages);

    const response = await createAgentUIStreamResponse({
      agent: buildAstraAgent({
        model,
        providerOptions,
        context,
        externalTools: { ...subAgentTools, ...external.exa } as ToolSet,
        prepareStep: phaseAwarePrepareStep({ isResearch }),
      }),
      uiMessages,
      abortSignal,
      headers,
      sendSources: true,
      onStepFinish: async (step) => {
        if (!onSource) {
          return;
        }

        await reportStepSources(step, onSource);
      },
    });

    if (!response.body) {
      await external.close();
      return response;
    }

    return new Response(response.body.pipeThrough(createCleanupStream(external.close)), response);
  } catch (error) {
    await external.close();
    throw error;
  }
}

function resolveSubAgentRoleModels(opts: { model: LanguageModel; providerOptions?: ProviderOptions }) {
  const fallback = { model: opts.model, providerOptions: opts.providerOptions };
  const planner = resolveSubAgentModel("planner", fallback);
  const critic = resolveSubAgentModel("critic", fallback);

  return {
    plannerModel: planner.model,
    plannerProviderOptions: planner.providerOptions,
    criticModel: critic.model,
    criticProviderOptions: critic.providerOptions,
  };
}

async function createAstraExternalTools({
  onSource,
}: {
  onSource?: SourceReporter;
} = {}) {
  const exa = await createExaMcpTools({ onSource });

  // Phase 2 research tools. These are NOT given to the orchestrator directly
  // — they are scoped into searcher/reader sub-agents via createSubAgentTools.
  // Source reporting for these tools happens at the orchestrator step level
  // (see RESEARCH_DISCOVERY_TOOL_NAMES + extractResearchSourcesFromToolResults).
  const research: ToolSet = {
    arxiv_search: createArxivSearchTool(),
    crossref_search: createCrossrefSearchTool(),
    pubmed_search: createPubmedSearchTool(),
    rerank_sources: createRerankSourcesTool(),
    fetch_url: createFetchUrlTool(),
    pdf_extract: createPdfExtractTool(),
  };

  return {
    exa: exa.tools as ToolSet,
    research,
    close: exa.close,
  };
}

async function reportStepSources(step: unknown, onSource: SourceReporter) {
  const record = asRecord(step);
  const toolResults = Array.isArray(record?.toolResults) ? record.toolResults : [];
  const sources = [
    ...normalizeAiSdkSources(Array.isArray(record?.sources) ? record.sources : []),
    ...extractExaSourcesFromToolResults(toolResults),
    ...extractResearchSourcesFromToolResults(toolResults),
  ];

  // Dedupe by URL — both Exa-style and research-tool extraction can surface the
  // same URL, and AI SDK source records may overlap with tool-result extraction.
  const seen = new Set<string>();
  for (const source of sources) {
    const key = source.url ?? source.providerSourceId ?? null;
    if (key) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }
    try {
      await onSource(source);
    } catch (error) {
      logSourceError("Failed to report agent-used source", source, error);
    }
  }
}

function normalizeAiSdkSources(sources: unknown[]): AgentUsedSource[] {
  return sources.flatMap<AgentUsedSource>((source) => {
    const record = asRecord(source);

    if (!record) {
      return [];
    }

    const sourceType = stringValue(record.sourceType);
    const providerSourceId = stringValue(record.id);
    const title = stringValue(record.title);
    const providerMetadata = record.providerMetadata;

    if (sourceType === "url") {
      const url = stringValue(record.url);

      if (!url) {
        return [];
      }

      return [{
        kind: "url",
        title,
        url,
        providerSourceId,
        metadata: { source: "ai-sdk", providerMetadata, sourceType },
      }];
    }

    if (sourceType === "document") {
      const filename = stringValue(record.filename);
      const mediaType = stringValue(record.mediaType);

      if (!providerSourceId && !filename && !mediaType) {
        return [];
      }

      return [{
        kind: "document",
        title,
        filename,
        mediaType,
        providerSourceId,
        metadata: { source: "ai-sdk", providerMetadata, sourceType },
      }];
    }

    return [];
  });
}

function extractResearchSourcesFromToolResults(toolResults: unknown[]): AgentUsedSource[] {
  const sources: AgentUsedSource[] = [];
  const seen = new Set<string>();

  for (const toolResult of toolResults) {
    const result = asRecord(toolResult);
    const toolName = stringValue(result?.toolName);
    if (!toolName || !RESEARCH_DISCOVERY_TOOL_NAMES.has(toolName)) {
      continue;
    }

    const output = parseJsonString(result?.output);
    const outputRecord = asRecord(output);
    if (!outputRecord) {
      continue;
    }

    const provider = stringValue(outputRecord.provider) ?? toolName.replace(/_search$/, "");
    const candidates = Array.isArray(outputRecord.candidates) ? outputRecord.candidates : [];

    for (const candidate of candidates) {
      const record = asRecord(candidate);
      if (!record) {
        continue;
      }
      const url = validUrl(stringValue(record.url));
      if (!url || seen.has(url)) {
        continue;
      }
      seen.add(url);

      const metadata: Record<string, unknown> = {
        source: "tool-result",
        toolName,
        provider,
      };

      const publishedDate = stringValue(record.publishedDate);
      if (publishedDate) {
        metadata.publishedDate = publishedDate;
      }
      const doi = stringValue(record.doi);
      if (doi) {
        metadata.doi = doi;
      }
      const authors = Array.isArray(record.authors)
        ? record.authors.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        : [];
      if (authors.length > 0) {
        metadata.authors = authors;
      }

      sources.push({
        kind: "url",
        title: stringValue(record.title),
        url,
        providerSourceId: stringValue(record.id),
        metadata,
      });
    }
  }

  return sources;
}

function extractExaSourcesFromToolResults(toolResults: unknown[]): AgentUsedSource[] {
  const sources: AgentUsedSource[] = [];
  const seen = new Set<string>();

  for (const toolResult of toolResults) {
    const result = asRecord(toolResult);
    const toolName = stringValue(result?.toolName);

    if (!toolName || !EXA_SOURCE_TOOL_NAMES.has(toolName)) {
      continue;
    }

    for (const source of extractExaSources(result?.output, toolName)) {
      if (!source.url || seen.has(source.url)) {
        continue;
      }

      seen.add(source.url);
      sources.push(source);
    }
  }

  return sources;
}

function extractExaSources(value: unknown, toolName: string): AgentUsedSource[] {
  const parsed = parseJsonString(value);
  return collectExaSources(parsed, toolName, 0);
}

function collectExaSources(value: unknown, toolName: string, depth: number): AgentUsedSource[] {
  if (depth > MAX_EXA_SOURCE_DEPTH) {
    return [];
  }

  const parsed = parseJsonString(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => collectExaSources(item, toolName, depth + 1));
  }

  const record = asRecord(parsed);

  if (!record) {
    return [];
  }

  const direct = sourceFromExaRecord(record, toolName);
  const nested = EXA_RESULT_CONTAINERS.flatMap((field) => {
    if (!(field in record)) {
      return [];
    }

    return collectExaSources(record[field], toolName, depth + 1);
  });

  return direct ? [direct, ...nested] : nested;
}

function sourceFromExaRecord(record: UnknownRecord, toolName: string): AgentUsedSource | null {
  const url = validUrl(stringValue(record.url));

  if (!url) {
    return null;
  }

  const metadata: Record<string, unknown> = {
    source: "tool-result",
    toolName,
    provider: "exa",
  };

  for (const field of EXA_METADATA_FIELDS) {
    const value = stringValue(record[field]);

    if (value) {
      metadata[field] = value;
    }
  }

  return {
    kind: "url",
    title: stringValue(record.title),
    url,
    providerSourceId: stringValue(record.id),
    metadata,
  };
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

function logSourceError(message: string, source: AgentUsedSource, error: unknown) {
  const payload: Record<string, unknown> = {
    level: "error",
    module: "agents",
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

function createCleanupStream<T>(cleanup: () => Promise<void>): TransformStream<T, T> {
  const transformer = new CleanupTransformer<T>(cleanup);
  return new TransformStream<T, T>(transformer);
}

class CleanupTransformer<T> implements Transformer<T, T> {
  private cleaned = false;

  constructor(private readonly cleanup: () => Promise<void>) {}

  transform(chunk: T, controller: TransformStreamDefaultController<T>) {
    controller.enqueue(chunk);
  }

  async flush() {
    await this.runCleanup();
  }

  async cancel() {
    await this.runCleanup();
  }

  private async runCleanup() {
    if (this.cleaned) {
      return;
    }
    this.cleaned = true;
    await this.cleanup();
  }
}
