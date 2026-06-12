import { normalizeKey, trimForSnippet } from "../lib/text";
import {
  depsFetch,
  providerFailure,
  readableError,
  type ExternalCandidate,
  type JinaReadResult,
  type ProviderDeps,
} from "./types";

// Exa search via REST (the exa-js client is a thin wrapper around these
// endpoints; fetch keeps the service dependency-light and easy to stub).
const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";
const EXA_CONTENTS_ENDPOINT = "https://api.exa.ai/contents";

export type ExaSearchOptions = {
  query: string;
  limit?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  category?: string;
};

type ExaResult = {
  title?: string | null;
  url: string;
  publishedDate?: string | null;
  text?: string | null;
  summary?: string | null;
  highlights?: string[] | null;
};

type ExaResponse = { results?: ExaResult[] };

export function exaResultToCandidate(result: ExaResult): ExternalCandidate {
  return {
    origin: "web",
    provider: "exa",
    evidenceStrength: "medium",
    title: result.title || result.url,
    locator: result.url,
    url: result.url,
    snippet:
      trimForSnippet(result.summary) ||
      trimForSnippet(result.text) ||
      trimForSnippet(result.highlights?.join(" ")) ||
      "No extract was available from this web result.",
    metadataJson: JSON.stringify({
      provider: "exa",
      publishedDate: result.publishedDate ?? undefined,
    }),
  };
}

export async function searchExaCandidates(
  deps: ProviderDeps,
  args: ExaSearchOptions,
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  if (!query) {
    return [];
  }
  const apiKey = deps.env.exaApiKey;
  if (!apiKey) {
    return [];
  }

  const limit = Math.min(args.limit ?? 8, 20);
  const cacheKey = normalizeKey(
    JSON.stringify({
      query,
      limit,
      includeDomains: args.includeDomains,
      excludeDomains: args.excludeDomains,
      startPublishedDate: args.startPublishedDate,
      endPublishedDate: args.endPublishedDate,
      category: args.category,
    }),
  );
  const cached = deps.cache.get<ExternalCandidate[]>("exa", cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await depsFetch(deps)(EXA_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: limit,
        type: "auto",
        includeDomains: cleanDomains(args.includeDomains),
        excludeDomains: cleanDomains(args.excludeDomains),
        startPublishedDate: args.startPublishedDate,
        endPublishedDate: args.endPublishedDate,
        category: args.category,
        contents: {
          text: { maxCharacters: 4_000 },
          highlights: { maxCharacters: 600 },
          summary: true,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Exa returned ${response.status}`);
    }
    const json = (await response.json()) as ExaResponse;
    const candidates = (json.results ?? []).map(exaResultToCandidate);
    deps.cache.putCandidates("exa", cacheKey, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("web", readableError(error), "exa");
    deps.cache.putCandidates("exa", cacheKey, failure, readableError(error));
    return failure;
  }
}

export async function readWithExaContents(
  deps: ProviderDeps,
  args: { url: string },
): Promise<JinaReadResult> {
  const apiKey = deps.env.exaApiKey;
  if (!apiKey) {
    return readFailure(args.url, "EXA_API_KEY is not configured");
  }
  const cacheKey = `contents:${normalizeKey(args.url)}`;
  const cached = deps.cache.get<JinaReadResult>("exa", cacheKey);
  if (cached) {
    return cached;
  }
  try {
    const response = await depsFetch(deps)(EXA_CONTENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        urls: [args.url],
        text: { maxCharacters: 18_000 },
        highlights: true,
        summary: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Exa returned ${response.status}`);
    }
    const json = (await response.json()) as ExaResponse;
    const result = json.results?.[0];
    const text = trimForSnippet(result?.text, 18_000);
    const ok = Boolean(text || result?.summary || result?.highlights?.length);
    const read: JinaReadResult = {
      ok,
      title: result?.title || args.url,
      url: result?.url || args.url,
      markdown: text,
      snippet:
        trimForSnippet(result?.summary) ||
        trimForSnippet(result?.highlights?.join(" ")) ||
        trimForSnippet(result?.text, 1_500),
      failureReason: ok ? undefined : "Exa returned empty content",
    };
    deps.cache.put("exa", cacheKey, read, ok ? "ready" : "failed", read.failureReason);
    return read;
  } catch (error) {
    const read = readFailure(args.url, readableError(error));
    deps.cache.put("exa", cacheKey, read, "failed", read.failureReason);
    return read;
  }
}

function readFailure(url: string, reason: string): JinaReadResult {
  return {
    ok: false,
    title: url || "Read failed",
    url,
    markdown: "",
    snippet: `Content read failed: ${reason}`,
    failureReason: reason,
  };
}

function cleanDomains(domains?: string[]): string[] | undefined {
  const cleaned = domains
    ?.map((domain) =>
      domain
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/.*$/, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}
