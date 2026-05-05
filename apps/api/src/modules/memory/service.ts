import { embed, embedMany, type EmbeddingModel } from "ai";
import { env } from "../../config";
import type { EvidenceCard } from "../../agents/subagents/schemas";
import { chunkText } from "./chunk";
import type {
  CachedSource,
  ChunkInsert,
  EvidenceCardEmbeddedInsert,
  EvidenceCardInsert,
  ImportantNumber,
  MemoryScope,
  RecallMatch,
  StoreCardsInput,
} from "./model";
import type { MemoryRepository } from "./repository";
import { urlNormalizeAndHash } from "./url-hash";

const FETCH_TOOL_NAMES = new Set([
  "web_fetch_exa",
  "fetch_url",
  "pdf_extract",
]);

type StepLike = {
  toolResults?: ReadonlyArray<unknown>;
};

type ParsedFetch = {
  url: string;
  title: string | null;
  body: string;
  mimeType: string | null;
  pageCount: number | null;
};

export class MemoryService {
  constructor(
    private readonly repo: MemoryRepository,
    private readonly embeddingModel: EmbeddingModel,
  ) {}

  async storeEvidenceCards(
    input: StoreCardsInput,
  ): Promise<{ stored: number }> {
    if (!env.ASTRA_MEMORY_ENABLED) return { stored: 0 };

    const rows = flattenCardsToRows(input.cards.cards, input.scope);
    if (rows.length === 0) return { stored: 0 };

    const { embeddings } = await embedMany({
      model: this.embeddingModel,
      values: rows.map((row) => row.claimText),
    });

    const inserts: EvidenceCardEmbeddedInsert[] = rows.map((row, idx) => ({
      ...row,
      embedding: embeddings[idx]!,
    }));

    const stored = await this.repo.insertCards(inserts);
    return { stored };
  }

  async recallByQuery(
    query: string,
    scope: { ownerUserId: string },
    opts?: { threshold?: number; limit?: number },
  ): Promise<RecallMatch[]> {
    if (!env.ASTRA_MEMORY_ENABLED) return [];
    if (!query.trim()) return [];

    const { embedding } = await embed({
      model: this.embeddingModel,
      value: query,
    });

    return this.repo.recall(
      scope.ownerUserId,
      embedding,
      opts?.threshold ?? env.ASTRA_MEMORY_RECALL_THRESHOLD,
      opts?.limit ?? env.ASTRA_MEMORY_RECALL_LIMIT,
    );
  }

  async lookupCachedSources(
    urls: string[],
    scope: { ownerUserId: string },
  ): Promise<Map<string, CachedSource>> {
    const result = new Map<string, CachedSource>();
    if (!env.ASTRA_MEMORY_ENABLED) return result;
    if (urls.length === 0) return result;

    const hashToOriginal = new Map<string, string>();
    for (const url of urls) {
      const hash = urlNormalizeAndHash(url);
      if (!hashToOriginal.has(hash)) {
        hashToOriginal.set(hash, url);
      }
    }

    const matches = await this.repo.lookupSourcesByUrlHash(
      scope.ownerUserId,
      Array.from(hashToOriginal.keys()),
    );

    for (const match of matches) {
      const cap = env.ASTRA_CACHE_MAX_CHARS;
      const sliced = match.text.length > cap ? match.text.slice(0, cap) : match.text;
      result.set(match.url, { ...match, text: sliced });
    }

    return result;
  }

  async persistFetchedBodies(
    steps: ReadonlyArray<unknown>,
    scope: { ownerUserId: string },
  ): Promise<{ persistedSources: number; persistedChunks: number }> {
    if (!env.ASTRA_MEMORY_ENABLED) {
      return { persistedSources: 0, persistedChunks: 0 };
    }

    const fetched = collectFetchResults(steps);
    if (fetched.length === 0) {
      return { persistedSources: 0, persistedChunks: 0 };
    }

    const allChunks: { sourceIdx: number; text: string }[] = [];
    const sourceChunkRanges: { start: number; count: number }[] = [];

    fetched.forEach((entry) => {
      const chunks = chunkText(entry.body, {
        size: env.ASTRA_CHUNK_SIZE_CHARS,
        overlap: 0,
      });
      const start = allChunks.length;
      for (const text of chunks) {
        allChunks.push({ sourceIdx: sourceChunkRanges.length, text });
      }
      sourceChunkRanges.push({ start, count: chunks.length });
    });

    if (allChunks.length === 0) {
      return { persistedSources: 0, persistedChunks: 0 };
    }

    const { embeddings } = await embedMany({
      model: this.embeddingModel,
      values: allChunks.map((chunk) => chunk.text),
    });

    let persistedSources = 0;
    let persistedChunks = 0;

    for (let i = 0; i < fetched.length; i += 1) {
      const entry = fetched[i]!;
      const range = sourceChunkRanges[i]!;
      if (range.count === 0) continue;

      const chunks: ChunkInsert[] = [];
      for (let j = 0; j < range.count; j += 1) {
        const chunk = allChunks[range.start + j]!;
        const embedding = embeddings[range.start + j]!;
        chunks.push({ text: chunk.text, embedding });
      }

      try {
        await this.repo.upsertSourceWithChunks(
          {
            ownerUserId: scope.ownerUserId,
            urlHash: urlNormalizeAndHash(entry.url),
            sourceUrl: entry.url,
            title: entry.title,
            mimeType: entry.mimeType,
            pageCount: entry.pageCount,
          },
          chunks,
        );
        persistedSources += 1;
        persistedChunks += chunks.length;
      } catch (error) {
        logMemoryError("Failed to persist fetched body", {
          url: entry.url,
          chunkCount: chunks.length,
        }, error);
      }
    }

    return { persistedSources, persistedChunks };
  }
}

export function flattenCardsToRows(
  cards: EvidenceCard[],
  scope: MemoryScope,
): EvidenceCardInsert[] {
  const rows: EvidenceCardInsert[] = [];
  for (const card of cards) {
    for (const claim of card.claims) {
      const importantNumbers: ImportantNumber[] = claim.importantNumbers.map(
        (entry) => ({ value: entry.value, unit: entry.unit }),
      );
      rows.push({
        ownerUserId: scope.ownerUserId,
        chatThreadId: scope.chatThreadId ?? null,
        runId: scope.runId ?? null,
        chatSourceId: null,
        sourceUrl: card.sourceUrl,
        sourceTitle: card.sourceTitle,
        claimText: claim.text,
        quote: claim.quote,
        importantNumbers,
        confidence: claim.confidence,
        tier: card.tier,
        qualityScore: card.qualityScore,
        provider: card.provider,
        notes: card.notes,
      });
    }
  }
  return rows;
}

function collectFetchResults(steps: ReadonlyArray<unknown>): ParsedFetch[] {
  const out: ParsedFetch[] = [];
  const seenUrls = new Set<string>();

  for (const step of steps) {
    const stepRecord = step as StepLike;
    const toolResults = Array.isArray(stepRecord?.toolResults)
      ? stepRecord.toolResults
      : [];

    for (const toolResult of toolResults) {
      const record = toolResult as Record<string, unknown> | null;
      if (!record) continue;
      const toolName = typeof record.toolName === "string" ? record.toolName : null;
      if (!toolName || !FETCH_TOOL_NAMES.has(toolName)) continue;
      const output = record.output ?? record.result;
      const parsed = parseFetchOutput(toolName, output);
      for (const entry of parsed) {
        const url = entry.url.trim();
        if (!url || seenUrls.has(url)) continue;
        if (!entry.body.trim()) continue;
        seenUrls.add(url);
        out.push(entry);
      }
    }
  }

  return out;
}

function parseFetchOutput(toolName: string, output: unknown): ParsedFetch[] {
  if (toolName === "fetch_url" || toolName === "pdf_extract") {
    return parseStructuredFetch(toolName, output);
  }
  if (toolName === "web_fetch_exa") {
    return parseExaFetch(output);
  }
  return [];
}

function parseStructuredFetch(
  toolName: string,
  output: unknown,
): ParsedFetch[] {
  const record = parseMaybeJson(output) as Record<string, unknown> | null;
  if (!record || record.ok !== true) return [];
  const url = stringValue(record.finalUrl) ?? stringValue(record.url);
  const body = stringValue(record.textContent) ?? "";
  if (!url || !body) return [];
  return [
    {
      url,
      title: stringValue(record.title),
      body,
      mimeType:
        toolName === "pdf_extract"
          ? "application/pdf"
          : "text/html",
      pageCount:
        toolName === "pdf_extract" && typeof record.pages === "number"
          ? Number(record.pages)
          : null,
    },
  ];
}

function parseExaFetch(output: unknown): ParsedFetch[] {
  const parsed = parseMaybeJson(output);
  const texts = collectExaTexts(parsed, 0);
  if (texts.length === 0) return [];

  const out: ParsedFetch[] = [];
  for (const text of texts) {
    for (const block of text.split(/\n---\n/g)) {
      const url = matchLine(block, "URL");
      if (!url) continue;
      const title = matchLine(block, "Title");
      const body = stripHeaderLines(block).trim();
      if (!body) continue;
      out.push({
        url,
        title,
        body,
        mimeType: "text/html",
        pageCount: null,
      });
    }
  }
  return out;
}

function collectExaTexts(value: unknown, depth: number): string[] {
  if (depth > 5) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectExaTexts(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      return [record.text];
    }
    return [
      "content",
      "contents",
      "results",
      "items",
      "data",
      "documents",
    ].flatMap((key) =>
      key in record ? collectExaTexts(record[key], depth + 1) : [],
    );
  }
  return [];
}

function matchLine(text: string, label: string): string | null {
  const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match ? match[1]!.trim() : null;
}

function stripHeaderLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^(URL|Title|Published|Author|Score|Source):\s/.test(line))
    .join("\n");
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function logMemoryError(
  message: string,
  context: Record<string, unknown>,
  error: unknown,
) {
  const payload: Record<string, unknown> = {
    level: "error",
    module: "memory",
    message,
    ...context,
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
