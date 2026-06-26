/**
 * Jina Reader (r.jina.ai) URL → clean markdown, Redis-cached. Ported from V1
 * `agent/providers/externalProviders.ts` (`readWithJinaReader` +
 * `parseJinaReaderResponse`), minus the billing `limitExternal`/credit gate
 * (P5) — here it's just fetch + cache. The `JINA_API_KEY` Authorization header
 * is sent only when the env var is set.
 */

import { getCache, putCache } from "./external-cache";
import { fetchWithTimeout } from "./http";

const JINA_READER_ENDPOINT = "https://r.jina.ai";
const CACHE_PROVIDER = "jina_read";

export type JinaReadResult = {
  ok: boolean;
  title: string;
  url: string;
  markdown: string;
  snippet: string;
  failureReason?: string;
};

/** Collapse whitespace and lowercase — a stable cache key. */
function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function trimForSnippet(value: string | null | undefined, max = 700): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

export async function readWithJinaReader(input: {
  url: string;
}): Promise<JinaReadResult> {
  const url = input.url.trim();
  if (!url) {
    return readFailure(url, "URL is empty");
  }

  const cacheKey = normalizeKey(url);
  const cached = await readCachedJson(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetchWithTimeout(`${JINA_READER_ENDPOINT}/${url}`, {
      headers: jinaHeaders({
        Accept: "application/json",
        "X-Return-Format": "markdown",
        "X-Retain-Links": "all",
        "X-With-Links-Summary": "true",
        "X-Max-Tokens": "18000",
        "X-Timeout": "20",
      }),
      // Client deadline above Jina's own `X-Timeout: 20` so the server-side cap
      // normally wins, but a stalled connection/body can't hang us past this.
      timeoutMs: 25_000,
    });
    if (!response.ok) {
      throw new Error(`Jina Reader returned ${response.status}`);
    }
    const text = await response.text();
    const result = parseJinaReaderResponse(text, url);
    await writeCachedJson(cacheKey, result, "ready");
    return result;
  } catch (error) {
    const result = readFailure(url, readableError(error));
    await writeCachedJson(cacheKey, result, "failed");
    return result;
  }
}

function jinaHeaders(headers: Record<string, string>): Record<string, string> {
  const apiKey = process.env.JINA_API_KEY;
  return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers;
}

function parseJinaReaderResponse(text: string, requestedUrl: string): JinaReadResult {
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

async function readCachedJson(cacheKey: string): Promise<JinaReadResult | null> {
  const cached = await getCache(CACHE_PROVIDER, cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached.valueJson) as JinaReadResult;
  } catch {
    return null;
  }
}

async function writeCachedJson(
  cacheKey: string,
  value: JinaReadResult,
  status: "ready" | "failed",
): Promise<void> {
  await putCache(CACHE_PROVIDER, cacheKey, status, JSON.stringify(value));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider failure";
}
