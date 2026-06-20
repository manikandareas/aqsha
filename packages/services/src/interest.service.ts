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
};
