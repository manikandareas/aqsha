import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { rateLimiter } from "../limits";

// GDELT DOC 2.0 — free, no API key. We use `timelinevol` to get the coverage
// volume timeline for a topic within Indonesian-language sources, which powers
// the Feed's "topik naik daun" cards (sparkline + momentum). Service path:
// global rate bucket + 24h cache, no per-user credits.
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export type GdeltTimeline = {
  values: number[];
  dates: string[];
};

type GdeltTimelinePoint = { date?: string; value?: number };
type GdeltTimelineResponse = {
  timeline?: Array<{ series?: string; data?: GdeltTimelinePoint[] }>;
};

export async function fetchGdeltTopicTimeline(
  ctx: ActionCtx,
  args: { query: string; timespan?: string },
): Promise<GdeltTimeline> {
  const query = args.query.trim();
  if (!query) return { values: [], dates: [] };
  const timespan = args.timespan ?? "3m";
  const cacheKey = `gdelt:timelinevol:v2:${timespan}:${query}`;

  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.externalProviders.getCache,
    { provider: "gdelt", cacheKey },
  );
  if (cached) {
    try {
      const parsed = JSON.parse(cached.valueJson) as GdeltTimeline;
      // Only trust non-empty cache hits — empty results are usually a transient
      // rate-limit and should be retried on the next run.
      if (parsed.values.length > 0) return parsed;
    } catch {
      // fall through
    }
  }

  const status = await rateLimiter.check(ctx, "gdeltGlobal");
  if (!status.ok) return { values: [], dates: [] };
  await rateLimiter.limit(ctx, "gdeltGlobal");

  // GDELT query operators live inside the `query` param. Restrict to
  // Indonesian-language coverage so topics reflect the local conversation.
  const fullQuery = `${query} sourcelang:indonesian`;
  const url = new URL(GDELT_ENDPOINT);
  url.searchParams.set("query", fullQuery);
  url.searchParams.set("mode", "timelinevol");
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("format", "json");

  let timeline: GdeltTimeline = { values: [], dates: [] };
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return timeline;
    // GDELT returns a plain-text warning (not JSON) when rate-limited, and can
    // emit HTML error pages — tolerate both and retry next run (no caching).
    const raw = await response.text();
    if (!raw.trimStart().startsWith("{")) return timeline;
    let json: GdeltTimelineResponse;
    try {
      json = JSON.parse(raw) as GdeltTimelineResponse;
    } catch {
      return timeline;
    }
    const data = json.timeline?.[0]?.data ?? [];
    timeline = {
      values: data.map((d) => (typeof d.value === "number" ? d.value : 0)),
      dates: data.map((d) => d.date ?? ""),
    };
  } catch {
    return timeline;
  }

  // Only cache successful, non-empty timelines so transient failures retry.
  if (timeline.values.length > 0) {
    await ctx.runMutation(internal.agent.externalProviders.putCache, {
      provider: "gdelt",
      cacheKey,
      status: "ready",
      valueJson: JSON.stringify(timeline),
    });
  }
  return timeline;
}

// Downsample a timeline to at most `points` evenly-spaced buckets for the
// sparkline, and derive a momentum-based trend score for ranking.
export function summarizeTimeline(
  values: number[],
  points = 24,
): { sparkline: number[]; trendScore: number } {
  if (values.length === 0) return { sparkline: [], trendScore: 0 };
  const sparkline =
    values.length <= points ? values.slice() : downsample(values, points);

  const quarter = Math.max(1, Math.floor(values.length / 4));
  const recentAvg = avg(values.slice(values.length - quarter));
  // Coverage-volume values are small fractions; scale to a comparable int.
  const trendScore = Math.round(recentAvg * 1_000_000);
  return { sparkline, trendScore };
}

function downsample(values: number[], points: number): number[] {
  const out: number[] = [];
  const bucket = values.length / points;
  for (let i = 0; i < points; i += 1) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    out.push(avg(values.slice(start, end)));
  }
  return out;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
