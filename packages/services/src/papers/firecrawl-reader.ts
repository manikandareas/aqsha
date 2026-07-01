/**
 * Firecrawl reader (`POST /v2/scrape`) URL → clean markdown, Redis-cached.
 * Menggantikan Jina Reader untuk ingest URL generik (non-akademik) → artifact.
 * READ-only; hasil di-cache via `external-cache` yang sama (TTL ready/failed).
 * `FIRECRAWL_API_KEY` WAJIB (Bearer) — tanpa key → failure + cache 'failed'
 * (degrade-graceful, worker menandai artifact gagal, tak melempar).
 */

import { normalizeKey, trimForSnippet } from "../research/text";
import { readableError } from "../research/types";
import { getCache, putCache } from "./external-cache";
import { fetchWithTimeout } from "./http";

const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const CACHE_PROVIDER = "firecrawl_read";

export type UrlReadResult = {
  ok: boolean;
  title: string;
  url: string;
  markdown: string;
  snippet: string;
  failureReason?: string;
};

export async function scrapeUrlFirecrawl(input: { url: string }): Promise<UrlReadResult> {
  const url = input.url.trim();
  if (!url) return readFailure(url, "URL is empty");

  const cacheKey = normalizeKey(url);
  const cached = await readCachedJson(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    const result = readFailure(url, "FIRECRAWL_API_KEY tak diset");
    await writeCachedJson(cacheKey, result, "failed");
    return result;
  }

  try {
    const response = await fetchWithTimeout(FIRECRAWL_SCRAPE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      timeoutMs: 25_000,
    });
    if (!response.ok) throw new Error(`Firecrawl Scrape returned ${response.status}`);
    const result = parseFirecrawlScrapeResponse(await response.json(), url);
    await writeCachedJson(cacheKey, result, result.ok ? "ready" : "failed");
    return result;
  } catch (error) {
    const result = readFailure(url, readableError(error));
    await writeCachedJson(cacheKey, result, "failed");
    return result;
  }
}

/** Parse `{ success, data: { url, markdown, metadata: { title, description } } }`. */
export function parseFirecrawlScrapeResponse(json: unknown, requestedUrl: string): UrlReadResult {
  const root = isRecord(json) ? json : null;
  // Firecrawl bisa balas HTTP 200 dengan `success:false` (mis. halaman diblokir) — jangan
  // perlakukan sebagai sukses walau ada markdown nyasar di `data`.
  if (!root || root.success === false) {
    return readFailure(requestedUrl, "Firecrawl scrape gagal (success=false)");
  }
  const data = isRecord(root.data) ? root.data : null;
  const markdown = data ? stringValue(data.markdown) : undefined;
  if (!data || !markdown) {
    return readFailure(requestedUrl, "Firecrawl scrape tanpa konten markdown");
  }
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const url = stringValue(data.url) || requestedUrl;
  return {
    ok: true,
    title: stringValue(metadata.title) || url,
    url,
    markdown,
    snippet: trimForSnippet(stringValue(metadata.description) || markdown, 1_500),
  };
}

function readFailure(url: string, reason: string): UrlReadResult {
  return {
    ok: false,
    title: url || "Read failed",
    url,
    markdown: "",
    snippet: `Firecrawl reader failed: ${reason}`,
    failureReason: reason,
  };
}

async function readCachedJson(cacheKey: string): Promise<UrlReadResult | null> {
  const cached = await getCache(CACHE_PROVIDER, cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached.valueJson) as UrlReadResult;
  } catch {
    return null;
  }
}

async function writeCachedJson(
  cacheKey: string,
  value: UrlReadResult,
  status: "ready" | "failed",
): Promise<void> {
  await putCache(CACHE_PROVIDER, cacheKey, status, JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
