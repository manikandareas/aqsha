import { sql } from "drizzle-orm";
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
};
