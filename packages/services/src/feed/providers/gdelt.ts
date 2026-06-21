/**
 * GDELT DOC 2.0 (free, no key) — `timelinevol` coverage-volume timeline per topic untuk
 * lane "topik naik daun" (sparkline + momentum). Port V1 `feed/providers/gdelt.ts`. Cache
 * 24h via external-cache; pacing ~5.2s antar-call dilakukan di lane (refreshTrendingTopics).
 */
import { getCache, putCache } from "../../papers/external-cache";

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export type GdeltTimeline = { values: number[]; dates: string[] };

type GdeltTimelinePoint = { date?: string; value?: number };
type GdeltTimelineResponse = {
  timeline?: Array<{ series?: string; data?: GdeltTimelinePoint[] }>;
};

export async function fetchGdeltTopicTimeline(args: {
  query: string;
  timespan?: string;
}): Promise<GdeltTimeline> {
  const query = args.query.trim();
  if (!query) return { values: [], dates: [] };
  const timespan = args.timespan ?? "3m";
  const cacheKey = `gdelt:timelinevol:v2:${timespan}:${query}`;

  const cached = await getCache("gdelt", cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached.valueJson) as GdeltTimeline;
      if (parsed.values.length > 0) return parsed;
    } catch {
      // fall through
    }
  }

  const fullQuery = `${query} sourcelang:indonesian`;
  const url = new URL(GDELT_ENDPOINT);
  url.searchParams.set("query", fullQuery);
  url.searchParams.set("mode", "timelinevol");
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("format", "json");

  let timeline: GdeltTimeline = { values: [], dates: [] };
  try {
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return timeline;
    // GDELT mengembalikan plain-text warning (bukan JSON) saat rate-limited; toleransi.
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

  if (timeline.values.length > 0) {
    await putCache("gdelt", cacheKey, "ready", JSON.stringify(timeline));
  }
  return timeline;
}

/** Downsample ke ≤`points` bucket (sparkline) + momentum trendScore. Port summarizeTimeline. */
export function summarizeTimeline(
  values: number[],
  points = 24,
): { sparkline: number[]; trendScore: number } {
  if (values.length === 0) return { sparkline: [], trendScore: 0 };
  const sparkline = values.length <= points ? values.slice() : downsample(values, points);
  const quarter = Math.max(1, Math.floor(values.length / 4));
  const recentAvg = avg(values.slice(values.length - quarter));
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
