import { and, eq } from "drizzle-orm";
import {
  type NewWaitlistEntry,
  type WaitlistEntry,
  waitlistEntries,
} from "../schema/waitlistEntries";
import type { DbOrTx } from "../types";

/** Repo waitlist_entries — query Drizzle saja; token/email lifecycle di @aqsha/services. */
export const WaitlistRepo = {
  async findByEmail(db: DbOrTx, email: string): Promise<WaitlistEntry | null> {
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, email))
      .limit(1);
    return rows[0] ?? null;
  },

  async findPendingByTokenHash(db: DbOrTx, tokenHash: string): Promise<WaitlistEntry | null> {
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.verificationTokenHash, tokenHash),
          eq(waitlistEntries.status, "pending"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Insert idempoten pada unique email.
   * `false` ⇒ konflik email diabaikan (baris sudah ada).
   */
  async insert(db: DbOrTx, row: NewWaitlistEntry): Promise<boolean> {
    const inserted = await db
      .insert(waitlistEntries)
      .values(row)
      .onConflictDoNothing({ target: waitlistEntries.email })
      .returning({ id: waitlistEntries.id });
    return inserted.length > 0;
  },

  async updateVerification(
    db: DbOrTx,
    id: string,
    patch: Partial<
      Pick<
        NewWaitlistEntry,
        | "verificationTokenHash"
        | "verificationExpiresAt"
        | "companyOrUniversity"
        | "updatedAt"
      >
    >,
  ): Promise<void> {
    await db.update(waitlistEntries).set(patch).where(eq(waitlistEntries.id, id));
  },

  /**
   * Konfirmasi atomik: hanya baris `pending` yang berubah.
   * Membersihkan token hash/expiry; `true` bila satu baris ter-update.
   */
  async confirmPending(db: DbOrTx, id: string, now: number): Promise<boolean> {
    const rows = await db
      .update(waitlistEntries)
      .set({
        status: "confirmed",
        verifiedAt: now,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        updatedAt: now,
      })
      .where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.status, "pending")))
      .returning({ id: waitlistEntries.id });
    return rows.length > 0;
  },
};
