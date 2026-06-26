import { bigint, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * user_feed_interests — sinyal minat per-topic (owner-scoped) untuk feed (P4).
 * Di P1 di-seed oleh OnboardingService dengan weight floor (2), raise-only idempotent.
 *
 * Composite PK (owner_user_id, topic) = uniqueness alami untuk upsert raise-only
 * (port index `by_owner_topic` V1). `weight` integer (sinyal ±, port `v.number()`).
 */
export const userFeedInterests = pgTable(
  "user_feed_interests",
  {
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    weight: integer("weight").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerUserId, t.topic] })],
);

export type UserFeedInterest = typeof userFeedInterests.$inferSelect;
export type NewUserFeedInterest = typeof userFeedInterests.$inferInsert;
