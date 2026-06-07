import Exa from "exa-js";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { cleanPlainText } from "../feedArticlePreview";
import { rateLimiter } from "../limits";

// Exa news search on the SERVICE path (cron). Unlike `searchExaCandidates`,
// this captures the result image (for image-led news cards) and uses the
// global `exaSearchGlobal` bucket instead of per-user credits. Exa is paid, so
// callers keep cadence low + result caps small; results are 24h-cached.
export type ScienceNewsItem = {
  title: string;
  url: string;
  summary: string;
  /** Full extracted article text for the news detail reader. */
  articleText?: string;
  imageUrl?: string;
  publishedAt?: number;
  sourceLabel: string;
};

export async function fetchScienceNews(
  ctx: ActionCtx,
  args: { query: string; limit?: number; startPublishedDate?: string },
): Promise<ScienceNewsItem[]> {
  const query = args.query.trim();
  if (!query) return [];
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  const limit = Math.min(args.limit ?? 6, 12);
  const cacheKey = `feed:news:${limit}:${args.startPublishedDate ?? "any"}:${query}`;

  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.externalProviders.getCache,
    { provider: "exa", cacheKey },
  );
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as ScienceNewsItem[];
    } catch {
      // fall through
    }
  }

  const status = await rateLimiter.check(ctx, "exaSearchGlobal");
  if (!status.ok) return [];
  await rateLimiter.limit(ctx, "exaSearchGlobal");

  let items: ScienceNewsItem[] = [];
  try {
    const exa = new Exa(apiKey);
    const response = await exa.search(query, {
      numResults: limit,
      type: "auto",
      category: "news",
      startPublishedDate: args.startPublishedDate,
      contents: { text: { maxCharacters: 10_000 }, summary: true },
    });
    items = response.results
      .map((result): ScienceNewsItem | null => {
        const url = result.url;
        if (!url) return null;
        const summary =
          (result.summary ?? result.text ?? "").replace(/\s+/g, " ").trim();
        return {
          title: (result.title || url).trim(),
          url,
          summary: summary.slice(0, 1_200),
          articleText: cleanPlainText(result.text ?? ""),
          imageUrl: result.image ?? undefined,
          publishedAt: result.publishedDate
            ? parseDateMs(result.publishedDate)
            : undefined,
          sourceLabel: domainOf(url),
        };
      })
      .filter((item): item is ScienceNewsItem => item !== null);
  } catch {
    await ctx.runMutation(internal.agent.externalProviders.putCache, {
      provider: "exa",
      cacheKey,
      status: "failed",
      valueJson: "[]",
    });
    return [];
  }

  await ctx.runMutation(internal.agent.externalProviders.putCache, {
    provider: "exa",
    cacheKey,
    status: items.length > 0 ? "ready" : "empty",
    valueJson: JSON.stringify(items),
  });
  return items;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "berita";
  }
}

function parseDateMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
