import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * waitlist_entries — pendaftar waitlist publik (email + opsional institusi).
 * Status `pending` sampai double opt-in via token hash; `confirmed` setelah verify.
 * Token mentah tidak pernah disimpan — hanya SHA-256 hash + expiry.
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull().unique(),
    companyOrUniversity: text("company_or_university"),
    status: text("status").notNull().default("pending"),
    verificationTokenHash: text("verification_token_hash"),
    verificationExpiresAt: bigint("verification_expires_at", { mode: "number" }),
    verifiedAt: bigint("verified_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("waitlist_entries_status_check", sql`${t.status} in ('pending', 'confirmed')`),
    index("waitlist_entries_by_token_hash").on(t.verificationTokenHash),
  ],
);

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;
