/**
 * Firecrawl web search (`POST /v2/search`) — provider untuk `search_web`,
 * menggantikan Jina. READ-only; hasil di-cache via Redis `external-cache` yang
 * sama (TTL ready/empty/failed). `FIRECRAWL_API_KEY` WAJIB (Bearer) — tanpa key
 * → [] + cache 'failed' (degrade-graceful, tak melempar ke model).
 */

import { fetchWithTimeout } from "../papers/http";
import { readCachedCandidates, writeCachedCandidates } from "./cache";
import { normalizeKey, trimForSnippet } from "./text";
import { type ResearchCandidate, readableError } from "./types";

const FIRECRAWL_SEARCH_ENDPOINT = "https://api.firecrawl.dev/v2/search";
const PROVIDER = "firecrawl_search";

export async function searchWebFirecrawl(args: {
  query: string;
  limit?: number;
}): Promise<ResearchCandidate[]> {
  const query = args.query.trim();
  if (!query) return [];
  const limit = Math.min(args.limit ?? 5, 10);
  const cacheKey = normalizeKey(JSON.stringify({ query, limit }));
  const cached = await readCachedCandidates(PROVIDER, cacheKey);
  if (cached) return cached;

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error("[research] firecrawl search dilewati: FIRECRAWL_API_KEY tak diset");
    await writeCachedCandidates(PROVIDER, cacheKey, [], "failed");
    return [];
  }

  try {
    const response = await fetchWithTimeout(FIRECRAWL_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
      timeoutMs: 20_000,
    });
    if (!response.ok) throw new Error(`Firecrawl Search returned ${response.status}`);
    const candidates = parseFirecrawlSearchResponse(await response.json(), limit);
    await writeCachedCandidates(PROVIDER, cacheKey, candidates);
    return candidates;
  } catch (error) {
    console.error("[research] firecrawl search failed", readableError(error));
    await writeCachedCandidates(PROVIDER, cacheKey, [], "failed");
    return [];
  }
}

/** Parse `{ success, data: { web: [{ url, title, markdown|description }] } }`. */
export function parseFirecrawlSearchResponse(json: unknown, limit: number): ResearchCandidate[] {
  if (!isRecord(json)) return [];
  const data = isRecord(json.data) ? json.data : null;
  const web = data && Array.isArray(data.web) ? data.web : [];
  return web
    .filter(isRecord)
    .slice(0, limit)
    .map((item) => {
      const url = stringValue(item.url) || stringValue(item.link);
      const title = stringValue(item.title) || url || "Hasil pencarian web";
      const snippet =
        stringValue(item.markdown) ||
        stringValue(item.description) ||
        stringValue(item.snippet) ||
        "Hasil pencarian web.";
      return {
        origin: "web" as const,
        provider: PROVIDER,
        evidenceStrength: "medium" as const,
        title,
        locator: url || title,
        url,
        snippet: trimForSnippet(snippet, 1_200),
      };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
