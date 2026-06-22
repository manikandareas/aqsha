import { sql } from "drizzle-orm";
import { bigint, boolean, check, pgTable, text } from "drizzle-orm/pg-core";

/**
 * users — mirror lokal identitas Clerk + (kelak) state-machine deletion.
 *
 * - `ownerUserId` (PK) == Clerk `payload.sub` (owner key kanonik V2; lihat keputusan
 *   Fase 1: ownerUserId == clerkUserId == sub).
 * - `clerkUserId` (unique) == Clerk `payload.sub` (dipakai untuk linking webhook).
 * - Profil (`email`/`name`/`image`/`emailVerified`) diisi oleh webhook Clerk
 *   (`user.created`/`user.updated`) — token sesi default tidak membawanya.
 * - timestamp epoch-ms (`bigint`) supaya nilai di kontrak identik dengan V1.
 *
 * State-machine deletion penuh (deletedAt/deletionStatus/…) landing P9; di P1 cukup
 * dua kolom request/complete yang sudah ada dari P0.
 */
export const users = pgTable(
  "users",
  {
    ownerUserId: text("owner_user_id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name"),
    image: text("image"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(0),
    deletionRequestedAt: bigint("deletion_requested_at", { mode: "number" }),
    deletionCompletedAt: bigint("deletion_completed_at", { mode: "number" }),
    // P9: window 'deleting' + state 'failed' (retry/support); 'deleted' praktis = baris hilang.
    deletionStatus: text("deletion_status").notNull().default("active"),
  },
  (t) => [
    check(
      "users_deletion_status_check",
      sql`${t.deletionStatus} in ('active', 'deleting', 'deleted', 'failed')`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
