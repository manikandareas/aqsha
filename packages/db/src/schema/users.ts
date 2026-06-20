import { bigint, pgTable, text } from "drizzle-orm/pg-core";

/**
 * users — mirror lokal identitas Clerk + state-machine deletion.
 *
 * - `ownerUserId` (PK) == Clerk `identity.tokenIdentifier` (owner key kanonik V1).
 * - `clerkUserId` (unique) == Clerk `identity.subject`.
 * - timestamp epoch-ms (`bigint`) supaya nilai di kontrak identik dengan V1 (`_creationTime`).
 *
 * P0 minimal: kolom profil (displayName/email/image) + relasi (workspaces, onboarding)
 * ditambah di fase berikutnya (P1+); state-machine deletion penuh landing P9.
 */
export const users = pgTable("users", {
  ownerUserId: text("owner_user_id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  deletionRequestedAt: bigint("deletion_requested_at", { mode: "number" }),
  deletionCompletedAt: bigint("deletion_completed_at", { mode: "number" }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
