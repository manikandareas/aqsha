import { collapse, normalizeKey, trimForSnippet } from "../lib/text";
import {
  depsFetch,
  providerFailure,
  readableError,
  type ExternalCandidate,
  type JinaReadResult,
  type ProviderDeps,
  type RerankInput,
  type RerankResult,
} from "./types";

const JINA_SEARCH_ENDPOINT = "https://s.jina.ai";
const JINA_READER_ENDPOINT = "https://r.jina.ai";
const JINA_RERANK_ENDPOINT = "https://api.jina.ai/v1/rerank";
const JINA_RERANK_MODEL = "jina-reranker-v2-base-multilingual";

export async function searchJinaCandidates(
  deps: ProviderDeps,
  args: { query: string; limit?: number; country?: string; language?: string },
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  if (!query) {
    return [];
  }
  const limit = Math.min(args.limit ?? 8, 20);
  const cacheKey = normalizeKey(
    JSON.stringify({ query, limit, country: args.country, language: args.language }),
  );
  const cached = deps.cache.get<ExternalCandidate[]>("jina_search", cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(`${JINA_SEARCH_ENDPOINT}/${encodeURIComponent(query)}`);
    url.searchParams.set("num", String(limit));
    if (args.country) {
      url.searchParams.set("gl", args.country);
    }
    if (args.language) {
      url.searchParams.set("hl", args.language);
    }
    const response = await depsFetch(deps)(url, {
      headers: jinaHeaders(deps, {
        Accept: "application/json",
        "X-Return-Format": "markdown",
        "X-Retain-Links": "all",
        "X-Max-Tokens": "12000",
      }),
    });
    if (!response.ok) {
      throw new Error(`Jina Search returned ${response.status}`);
    }
    const text = await response.text();
    const parsed = parseJinaSearchResponse(text, limit);
    deps.cache.putCandidates("jina_search", cacheKey, parsed);
    return parsed;
  } catch (error) {
    const failure = providerFailure("web", readableError(error), "jina_search");
    deps.cache.putCandidates("jina_search", cacheKey, failure, readableError(error));
    return failure;
  }
}

export async function readWithJinaReader(
  deps: ProviderDeps,
  args: { url: string },
): Promise<JinaReadResult> {
  const url = args.url.trim();
  if (!url) {
    return readFailure(url, "URL is empty");
  }
  const cacheKey = normalizeKey(url);
  const cached = deps.cache.get<JinaReadResult>("jina_read", cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await depsFetch(deps)(`${JINA_READER_ENDPOINT}/${url}`, {
      headers: jinaHeaders(deps, {
        Accept: "application/json",
        "X-Return-Format": "markdown",
        "X-Retain-Links": "all",
        "X-With-Links-Summary": "true",
        "X-Max-Tokens": "18000",
        "X-Timeout": "20",
      }),
    });
    if (!response.ok) {
      throw new Error(`Jina Reader returned ${response.status}`);
    }
    const text = await response.text();
    const result = parseJinaReaderResponse(text, url);
    deps.cache.put("jina_read", cacheKey, result, "ready");
    return result;
  } catch (error) {
    const result = readFailure(url, readableError(error));
    deps.cache.put("jina_read", cacheKey, result, "failed", result.failureReason);
    return result;
  }
}

export async function jinaRerank(
  deps: ProviderDeps,
  args: { query: string; documents: RerankInput[]; topN?: number },
): Promise<RerankResult[]> {
  const documents = args.documents.filter((document) => document.text.trim());
  if (documents.length === 0) {
    return [];
  }
  const topN = Math.min(args.topN ?? documents.length, documents.length);
  const cacheKey = normalizeKey(
    JSON.stringify({
      query: args.query,
      topN,
      documents: documents.map((document) => [
        document.sourceKey,
        document.text.slice(0, 300),
      ]),
    }),
  );
  const cached = deps.cache.get<RerankResult[]>("jina_rerank", cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = deps.env.jinaApiKey;
  if (!apiKey) {
    return fallbackRerank(args.query, documents, topN);
  }

  try {
    const response = await depsFetch(deps)(JINA_RERANK_ENDPOINT, {
      method: "POST",
      headers: jinaHeaders(deps, {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      body: JSON.stringify({
        model: JINA_RERANK_MODEL,
        query: args.query,
        top_n: topN,
        documents: documents.map((document) => `${document.title}\n${document.text}`),
      }),
    });
    if (!response.ok) {
      throw new Error(`Jina Reranker returned ${response.status}`);
    }
    const json = (await response.json()) as JinaRerankResponse;
    const results = (json.results ?? [])
      .map((item, rank) => {
        const document = documents[item.index];
        if (!document) {
          return null;
        }
        return {
          sourceKey: document.sourceKey,
          score: item.relevance_score ?? 0,
          rank: rank + 1,
        };
      })
      .filter((item): item is RerankResult => Boolean(item));
    deps.cache.put("jina_rerank", cacheKey, results, "ready");
    return results;
  } catch (error) {
    const results = fallbackRerank(args.query, documents, topN);
    deps.cache.put("jina_rerank", cacheKey, results, "failed", readableError(error));
    return results;
  }
}

export function parseJinaSearchResponse(
  text: string,
  limit: number,
): ExternalCandidate[] {
  const json = parseJson(text);
  const jsonItems = extractJsonSearchItems(json);
  if (jsonItems.length > 0) {
    return jsonItems.slice(0, limit).map((item) => ({
      origin: "web" as const,
      provider: "jina_search",
      evidenceStrength: "medium" as const,
      title: item.title || item.url || "Jina Search result",
      locator: item.url || item.title || "jina-search",
      url: item.url,
      snippet: trimForSnippet(
        item.content || item.description || item.snippet || "Jina Search result.",
        1_200,
      ),
    }));
  }

  const blocks = [
    ...text.matchAll(
      /(?:^|\n)Title:\s*(.+?)\nURL Source:\s*(\S+)(?:\nMarkdown Content:\s*([\s\S]*?))?(?=\nTitle:|\n\nTitle:|$)/g,
    ),
  ];
  if (blocks.length > 0) {
    return blocks.slice(0, limit).map((match) => ({
      origin: "web" as const,
      provider: "jina_search",
      evidenceStrength: "medium" as const,
      title: collapse(match[1] ?? match[2] ?? "Jina Search result"),
      locator: match[2] ?? "jina-search",
      url: match[2],
      snippet: trimForSnippet(match[3] ?? "Jina Search result.", 1_200),
    }));
  }

  return [
    {
      origin: "web" as const,
      provider: "jina_search",
      evidenceStrength: "weak" as const,
      title: "Jina Search result",
      locator: "jina-search",
      snippet:
        trimForSnippet(text, 1_200) || "Jina Search returned no readable result.",
    },
  ];
}

export function parseJinaReaderResponse(
  text: string,
  requestedUrl: string,
): JinaReadResult {
  const json = parseJson(text);
  if (isRecord(json)) {
    const data = isRecord(json.data) ? json.data : json;
    const markdown =
      stringValue(data.content) ||
      stringValue(data.markdown) ||
      stringValue(data.text) ||
      text;
    const url = stringValue(data.url) || requestedUrl;
    return {
      ok: true,
      title: stringValue(data.title) || url,
      url,
      markdown,
      snippet: trimForSnippet(markdown, 1_500),
    };
  }

  const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? requestedUrl;
  const sourceUrl = text.match(/^URL Source:\s*(.+)$/m)?.[1]?.trim() ?? requestedUrl;
  const markdown = text
    .replace(/^Title:.*$/m, "")
    .replace(/^URL Source:.*$/m, "")
    .replace(/^Markdown Content:\s*/m, "")
    .trim();
  return {
    ok: true,
    title,
    url: sourceUrl,
    markdown,
    snippet: trimForSnippet(markdown, 1_500),
  };
}

function readFailure(url: string, reason: string): JinaReadResult {
  return {
    ok: false,
    title: url || "Read failed",
    url,
    markdown: "",
    snippet: `Jina Reader failed: ${reason}`,
    failureReason: reason,
  };
}

export function fallbackRerank(
  query: string,
  documents: RerankInput[],
  topN: number,
): RerankResult[] {
  const terms = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 2),
  );
  return documents
    .map((document) => {
      const text = `${document.title} ${document.text}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (text.includes(term)) {
          score += 1;
        }
      }
      return { sourceKey: document.sourceKey, score, rank: 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

function jinaHeaders(
  deps: ProviderDeps,
  headers: Record<string, string>,
): Record<string, string> {
  const apiKey = deps.env.jinaApiKey;
  return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers;
}

type JinaRerankResponse = {
  results?: Array<{ index: number; relevance_score?: number }>;
};

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonSearchItems(json: unknown): Array<{
  title?: string;
  url?: string;
  content?: string;
  description?: string;
  snippet?: string;
}> {
  if (!isRecord(json)) {
    return [];
  }
  const data = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.results)
      ? json.results
      : [];
  return data.filter(isRecord).map((item) => ({
    title: stringValue(item.title),
    url: stringValue(item.url) || stringValue(item.link),
    content:
      stringValue(item.content) ||
      stringValue(item.markdown) ||
      stringValue(item.text),
    description: stringValue(item.description),
    snippet: stringValue(item.snippet),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
