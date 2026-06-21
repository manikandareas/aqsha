import { InterestRepo } from "@aqsha/db";
import type { DbOrTx } from "@aqsha/db";
import { normalizeInterestTopic } from "./feed/interestKeywords";

/** Seed sinyal minat feed. Port `seedFeedInterests` V1: dedup + raise-only idempotent. */
export const InterestService = {
  async seedFeedInterests(
    db: DbOrTx,
    ownerUserId: string,
    topics: string[],
    weight: number,
  ): Promise<void> {
    const now = Date.now();
    const seen = new Set<string>();
    for (const raw of topics) {
      const topic = normalizeInterestTopic(raw);
      if (!topic || seen.has(topic)) continue;
      seen.add(topic);
      await InterestRepo.upsertRaiseOnly(db, { ownerUserId, topic, weight, updatedAt: now });
    }
  },

  /**
   * Map bobot minat owner (lowercase topic → weight) untuk scoring feed. Port V1
   * loadInterestWeights (cap 200 baris).
   */
  async loadWeights(db: DbOrTx, ownerUserId: string): Promise<Map<string, number>> {
    const rows = await InterestRepo.listWeights(db, ownerUserId, 200);
    const map = new Map<string, number>();
    for (const row of rows) map.set(normalizeInterestTopic(row.topic), row.weight);
    return map;
  },

  /**
   * Top-N topik minat (normalized, dedup case-variant → weight tertinggi). Port V1
   * feed.userInterestTopics — seed rekomendasi explore + explainRelevance.
   */
  async topInterestTopics(db: DbOrTx, ownerUserId: string, limit = 8): Promise<string[]> {
    const rows = await InterestRepo.topTopics(db, ownerUserId, 100);
    const seen = new Set<string>();
    const topics: string[] = [];
    for (const row of rows) {
      const topic = normalizeInterestTopic(row.topic);
      if (!topic || seen.has(topic)) continue;
      seen.add(topic);
      topics.push(topic);
      if (topics.length >= limit) break;
    }
    return topics;
  },

  /**
   * Bump sinyal minat per-topic (save +1 / research +2 / hide −1). Port V1 bumpInterests:
   * normalize + cap 5 topik/item, raise additif, insert hanya bila delta>0.
   */
  async bump(db: DbOrTx, ownerUserId: string, topics: string[], delta: number): Promise<void> {
    const now = Date.now();
    const seen = new Set<string>();
    for (const raw of topics.slice(0, 5)) {
      const topic = normalizeInterestTopic(raw);
      if (!topic || seen.has(topic)) continue;
      seen.add(topic);
      await InterestRepo.bumpWeight(db, ownerUserId, topic, delta, now);
    }
  },
};
