/**
 * Ranking helpers feed — port verbatim V1 `feed.ts` (interestMatch/recency/popularity/
 * kindBoost/deClump/reasonFor). Pure (tanpa DB). Dipakai FeedService.getFeed/getFeedPaginated.
 * `kind` ditipekan `string` (bukan union) supaya row Drizzle bisa langsung di-skor.
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

/** Nudge per-kind supaya lane non-paper tetap muncul. */
export function kindBoost(kind: string): number {
  switch (kind) {
    case "claim":
    case "idea":
      return 0.25;
    case "topic":
      return 0.2;
    case "news":
      return 0.15;
    default:
      return 0;
  }
}

/** Greedy re-order: tak boleh >2 (sebenarnya: tak ada 2 berturut) kind sama; skor tinggi tetap awal. */
export function deClump<T extends { item: { kind: string } }>(scored: T[], limit: number): T[] {
  const out: T[] = [];
  const pool = [...scored]; // sudah desc by score
  while (out.length < limit && pool.length > 0) {
    let pickIndex = 0;
    if (out.length >= 1) {
      const prev = out[out.length - 1]!.item.kind;
      if (pool[0]!.item.kind === prev) {
        const alt = pool.findIndex((e) => e.item.kind !== prev);
        if (alt >= 0) pickIndex = alt;
      }
    }
    out.push(pool.splice(pickIndex, 1)[0]!);
  }
  return out;
}

/** "Kenapa aku lihat ini" (Bahasa Indonesia). Port reasonFor V1. */
export function reasonFor(
  item: { kind: string; trendScore: number },
  interest: { topTopic?: string },
  serendipity: boolean,
): string {
  if (serendipity) return "Bidang bersebelahan";
  if (interest.topTopic) return `Karena minat: ${interest.topTopic}`;
  switch (item.kind) {
    case "claim":
      return "Klaim diperiksa pemeriksa fakta";
    case "topic":
      return "Sedang ramai diperbincangkan";
    case "news":
      return "Berita terbaru";
    case "idea":
      return "Celah riset untuk digali";
    default:
      return item.trendScore > 0 ? "Banyak disitasi" : "Baru terbit";
  }
}
