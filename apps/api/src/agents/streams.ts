import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { Buffer } from "node:buffer";
import { createAgentUIStream, createAgentUIStreamResponse, tool, type LanguageModel, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import type { AgentUsedSource, CreateChatResponseInput } from "../modules/agents/model";
import { buildAstraAgent } from "./astra";
import { createExaMcpTools } from "./mcp/exa";
import type { AgentRuntimeContext } from "./types";

type UnknownRecord = Record<string, unknown>;
type SourceReporter = (source: AgentUsedSource) => Promise<void> | void;
type ArtifactPublisher = NonNullable<CreateChatResponseInput["onArtifact"]>;

const EXA_SOURCE_TOOL_NAMES = new Set(["web_search_exa", "web_fetch_exa"]);
const EXA_RESULT_CONTAINERS = ["results", "items", "content", "contents", "data", "documents"];
const EXA_METADATA_FIELDS = ["publishedDate", "author", "summary"];
const MAX_EXA_SOURCE_DEPTH = 5;
const MAX_PNG_BASE64_LENGTH = 8_000_000;

export async function createAstraAgentUIStream({
  model,
  providerOptions,
  context,
  uiMessages,
  abortSignal,
}: {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
}) {
  const external = await createAstraExternalTools();
  try {
    const stream = await createAgentUIStream({
      agent: buildAstraAgent({ model, providerOptions, context, externalTools: external.tools }),
      uiMessages,
      abortSignal,
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
  onArtifact,
}: {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  context: AgentRuntimeContext;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
  headers?: HeadersInit;
  onSource?: SourceReporter;
  onArtifact?: ArtifactPublisher;
}) {
  const external = await createAstraExternalTools({ onSource, onArtifact });
  try {
    const response = await createAgentUIStreamResponse({
      agent: buildAstraAgent({ model, providerOptions, context, externalTools: external.tools }),
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

async function createAstraExternalTools({
  onSource,
  onArtifact,
}: {
  onSource?: SourceReporter;
  onArtifact?: ArtifactPublisher;
} = {}) {
  const exa = await createExaMcpTools({ onSource });
  const tools: ToolSet = {
    ...(exa.tools as ToolSet),
  };

  if (onArtifact) {
    tools.publishPngArtifact = tool({
      description:
        "Publish a final PNG visual artifact to UploadThing and return Markdown image syntax for embedding in the final answer. Use only for final audited visual artifacts, not raw/supporting files.",
      inputSchema: z.object({
        filename: z.string().min(1).describe("Filename ending in .png."),
        title: z.string().min(1).describe("Human-readable artifact title."),
        altText: z.string().min(1).optional().describe("Accessible image alt text."),
        caption: z.string().optional().describe("Optional Markdown caption text."),
        pngBase64: z
          .string()
          .min(1)
          .max(MAX_PNG_BASE64_LENGTH)
          .describe("PNG bytes encoded as base64, with or without a data URL prefix."),
        sourceIds: z.array(z.string().min(1)).optional().describe("Evidence source IDs that support the visual."),
        metadata: z.record(z.string(), z.unknown()).optional().describe("Audit or renderer metadata."),
      }),
      execute: async ({ filename, title, altText, caption, pngBase64, sourceIds, metadata }) => {
        const published = await onArtifact({
          bytes: decodePngBase64(pngBase64),
          filename,
          title,
          altText,
          caption,
          sourceIds,
          metadata,
        });

        return {
          artifactId: published.artifact.id,
          fileKey: published.artifact.fileKey,
          url: published.artifact.url,
          markdown: published.markdown,
          contentType: published.artifact.contentType,
          byteSize: published.artifact.byteSize,
        };
      },
    });
  }

  return {
    tools,
    close: exa.close,
  };
}

function decodePngBase64(value: string): Uint8Array {
  const normalized = value.replace(/^data:image\/png;base64,/i, "");

  return new Uint8Array(Buffer.from(normalized, "base64"));
}

async function reportStepSources(step: unknown, onSource: SourceReporter) {
  const record = asRecord(step);
  const sources = [
    ...normalizeAiSdkSources(Array.isArray(record?.sources) ? record.sources : []),
    ...extractExaSourcesFromToolResults(Array.isArray(record?.toolResults) ? record.toolResults : []),
  ];

  for (const source of sources) {
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
