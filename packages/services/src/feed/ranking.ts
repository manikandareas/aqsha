/**
 * Ranking helpers feed — skor minat/kesegaran/popularitas. Pure (tanpa DB). Dipakai
 * FeedService.getFeed/getFeedPaginated.
 */
const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 21;

export type InterestWeights = Map<string, number>;

/** Skor minat 0..1 (saturasi di ~weight 5) + topik dengan weight tertinggi. */
export function interestMatch(
  topics: string[],
  interests: InterestWeights,
): { normalized: number; topTopic?: string } {
  let total = 0;
  let topTopic: string | undefined;
  let topWeight = 0;
  for (const topic of topics) {
    const weight = interests.get(topic.trim().toLowerCase());
    if (weight && weight > 0) {
      total += weight;
      if (weight > topWeight) {
        topWeight = weight;
        topTopic = topic;
      }
    }
  }
  const normalized = total <= 0 ? 0 : total / (total + 4);
  return { normalized, topTopic };
}

/** Exponential decay (half-life 21 hari). */
export function recencyScore(timestamp: number, now: number): number {
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  return Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
}

/** log10-normalized (≈1.0 di ~100k sitasi/volume). */
export function popularityScore(trendScore: number): number {
  if (!trendScore || trendScore <= 0) return 0;
  return Math.min(1, Math.log10(trendScore + 1) / 5);
}

