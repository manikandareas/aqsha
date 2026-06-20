import { eq } from "drizzle-orm";
import {
  type NewUserOnboarding,
  type UserOnboarding,
  userOnboarding,
} from "../schema/userOnboarding";
import type { DbOrTx } from "../types";

/** Repo user_onboarding — query Drizzle saja. */
export const OnboardingRepo = {
  async findByOwner(db: DbOrTx, ownerUserId: string): Promise<UserOnboarding | null> {
    const rows = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.ownerUserId, ownerUserId))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Upsert keyed by PK (owner_user_id) — overwrite jawaban + completedAt. */
  async upsert(db: DbOrTx, row: NewUserOnboarding): Promise<void> {
    await db
      .insert(userOnboarding)
      .values(row)
      .onConflictDoUpdate({
        target: userOnboarding.ownerUserId,
        set: {
          background: row.background,
          interests: row.interests,
          heardAboutSource: row.heardAboutSource,
          heardAboutOther: row.heardAboutOther ?? null,
          completedAt: row.completedAt,
          updatedAt: row.updatedAt,
        },
      });
  },
};
