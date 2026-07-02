import { eq } from "drizzle-orm";
import {
  type UserAgentPreferences,
  userAgentPreferences,
} from "../schema/userAgentPreferences";
import type { DbOrTx } from "../types";

/** Repo user_agent_preferences — query Drizzle saja (validasi enum/cap hidup di service). */
export const UserAgentPreferencesRepo = {
  async findByOwner(db: DbOrTx, ownerUserId: string): Promise<UserAgentPreferences | null> {
    const rows = await db
      .select()
      .from(userAgentPreferences)
      .where(eq(userAgentPreferences.ownerUserId, ownerUserId))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Upsert PATCH-style: hanya kolom di `set` yang ditimpa (field absen = tak disentuh). */
  async upsertPatch(
    db: DbOrTx,
    ownerUserId: string,
    set: Partial<
      Pick<
        UserAgentPreferences,
        "answerLanguage" | "citationStyle" | "responseStyle" | "customInstruction"
      >
    >,
    now: number,
  ): Promise<void> {
    await db
      .insert(userAgentPreferences)
      .values({
        ownerUserId,
        answerLanguage: set.answerLanguage ?? null,
        citationStyle: set.citationStyle ?? null,
        responseStyle: set.responseStyle ?? null,
        customInstruction: set.customInstruction ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userAgentPreferences.ownerUserId,
        set: { ...set, updatedAt: now },
      });
  },
};
