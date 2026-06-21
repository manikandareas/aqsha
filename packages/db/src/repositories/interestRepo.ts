import { and, desc, eq, gt, sql } from "drizzle-orm";
import { type NewUserFeedInterest, userFeedInterests } from "../schema/userFeedInterests";
import type { DbOrTx } from "../types";

/** Repo user_feed_interests — query Drizzle saja. */
export const InterestRepo = {
  /**
   * Upsert raise-only: insert bila baru; bila ada, naikkan weight HANYA bila
   * weight lama < weight baru (`setWhere`). Idempotent (re-seed weight sama = no-op).
   * Port semantik `seedFeedInterests` V1 ke satu statement atomik.
   */
  async upsertRaiseOnly(db: DbOrTx, row: NewUserFeedInterest): Promise<void> {
    await db
      .insert(userFeedInterests)
      .values(row)
      .onConflictDoUpdate({
        target: [userFeedInterests.ownerUserId, userFeedInterests.topic],
        set: { weight: row.weight, updatedAt: row.updatedAt },
        setWhere: sql`${userFeedInterests.weight} < ${row.weight}`,
      });
  },

  /** Bobot minat owner (cap `limit`) untuk scoring feed (loadInterestWeights V1). */
  async listWeights(
    db: DbOrTx,
    ownerUserId: string,
    limit: number,
  ): Promise<Array<{ topic: string; weight: number }>> {
    return db
      .select({ topic: userFeedInterests.topic, weight: userFeedInterests.weight })
      .from(userFeedInterests)
      .where(eq(userFeedInterests.ownerUserId, ownerUserId))
      .limit(limit);
  },

  /** Top-N topik dengan weight>0 (desc) untuk seed rekomendasi explore (userInterestTopics V1). */
  async topTopics(
    db: DbOrTx,
    ownerUserId: string,
    limit: number,
  ): Promise<Array<{ topic: string; weight: number }>> {
    return db
      .select({ topic: userFeedInterests.topic, weight: userFeedInterests.weight })
      .from(userFeedInterests)
      .where(and(eq(userFeedInterests.ownerUserId, ownerUserId), gt(userFeedInterests.weight, 0)))
      .orderBy(desc(userFeedInterests.weight))
      .limit(limit);
  },

  /**
   * Bump signed weight (save +1 / research +2 / hide −1). Port V1 bumpInterests:
   * ada → weight+delta; tak ada → insert HANYA bila delta>0 (jangan menanam weight negatif).
   */
  async bumpWeight(
    db: DbOrTx,
    ownerUserId: string,
    topic: string,
    delta: number,
    now: number,
  ): Promise<void> {
    if (delta >= 0) {
      await db
        .insert(userFeedInterests)
        .values({ ownerUserId, topic, weight: delta, updatedAt: now })
        .onConflictDoUpdate({
          target: [userFeedInterests.ownerUserId, userFeedInterests.topic],
          set: { weight: sql`${userFeedInterests.weight} + ${delta}`, updatedAt: now },
        });
      return;
    }
    // delta<0: update-only (jangan insert baris baru bernilai negatif).
    await db
      .update(userFeedInterests)
      .set({ weight: sql`${userFeedInterests.weight} + ${delta}`, updatedAt: now })
      .where(and(eq(userFeedInterests.ownerUserId, ownerUserId), eq(userFeedInterests.topic, topic)));
  },
};
