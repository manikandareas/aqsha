/**
 * Jina web search (`s.jina.ai`) — Slice 6.4, keputusan D-G (Jina-only; Exa
 * di-DROP). Port of V1 `searchJinaCandidates`, swapping the in-process
 * `ProviderCache` for the Redis `external-cache` and reading `JINA_API_KEY`
 * straight from env (Bearer sent only when set).
 */

import { fetchWithTimeout } from "../papers/http";
import { readCachedCandidates, writeCachedCandidates } from "./cache";
import { collapse, normalizeKey, trimForSnippet } from "./text";
import { type ResearchCandidate, readableError } from "./types";

const JINA_SEARCH_ENDPOINT = "https://s.jina.ai";
const PROVIDER = "jina_search";

function jinaHeaders(headers: Record<string, string>): Record<string, string> {
  const apiKey = process.env.JINA_API_KEY;
  return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers;
}

export async function searchWebJina(args: {
  query: string;
  limit?: number;
  country?: string;
  language?: string;
}): Promise<ResearchCandidate[]> {
  const query = args.query.trim();
  if (!query) return [];
  const limit = Math.min(args.limit ?? 5, 10);
  const cacheKey = normalizeKey(
    JSON.stringify({ query, limit, country: args.country, language: args.language }),
  );
  const cached = await readCachedCandidates(PROVIDER, cacheKey);
  if (cached) return cached;

  try {
    const url = new URL(`${JINA_SEARCH_ENDPOINT}/${encodeURIComponent(query)}`);
    url.searchParams.set("num", String(limit));
    if (args.country) url.searchParams.set("gl", args.country);
    if (args.language) url.searchParams.set("hl", args.language);
    const response = await fetchWithTimeout(url.toString(), {
      headers: jinaHeaders({
        Accept: "application/json",
        "X-Return-Format": "markdown",
        "X-Retain-Links": "all",
        "X-Max-Tokens": "12000",
      }),
      timeoutMs: 20_000,
    });
    if (!response.ok) throw new Error(`Jina Search returned ${response.status}`);
    const candidates = parseJinaSearchResponse(await response.text(), limit);
    await writeCachedCandidates(PROVIDER, cacheKey, candidates);
    return candidates;
  } catch (error) {
    console.error("[research] jina search failed", readableError(error));
    await writeCachedCandidates(PROVIDER, cacheKey, [], "failed");
    return [];
  }
}

export function parseJinaSearchResponse(text: string, limit: number): ResearchCandidate[] {
  const json = parseJson(text);
  const jsonItems = extractJsonSearchItems(json);
  if (jsonItems.length > 0) {
    return jsonItems.slice(0, limit).map((item) => ({
      origin: "web" as const,
      provider: PROVIDER,
      evidenceStrength: "medium" as const,
      title: item.title || item.url || "Hasil pencarian web",
      locator: item.url || item.title || "jina-search",
      url: item.url,
      snippet: trimForSnippet(
        item.content || item.description || item.snippet || "Hasil pencarian web.",
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
      provider: PROVIDER,
      evidenceStrength: "medium" as const,
      title: collapse(match[1] ?? match[2] ?? "Hasil pencarian web"),
      locator: match[2] ?? "jina-search",
      url: match[2],
      snippet: trimForSnippet(match[3] ?? "Hasil pencarian web.", 1_200),
    }));
  }

  return [];
}

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
  if (!isRecord(json)) return [];
  const data = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.results)
      ? json.results
      : [];
  return data.filter(isRecord).map((item) => ({
    title: stringValue(item.title),
    url: stringValue(item.url) || stringValue(item.link),
    content: stringValue(item.content) || stringValue(item.markdown) || stringValue(item.text),
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
