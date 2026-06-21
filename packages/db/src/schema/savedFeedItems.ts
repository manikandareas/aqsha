import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { feedItems } from "./feedItems";
import { users } from "./users";

/**
 * saved_feed_items — koleksi "disimpan" per-owner (P4). Port V1 `savedFeedItems`
 * (drop `collectionId`/`feedCollections` — deferred). Unique (owner, feed_item) untuk
 * save idempotent; index by_owner_created untuk daftar koleksi terurut.
 */
export const savedFeedItems = pgTable(
  "saved_feed_items",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItems.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("saved_feed_items_by_owner_item").on(t.ownerUserId, t.feedItemId),
    index("saved_feed_items_by_owner_created").on(t.ownerUserId, t.createdAt),
  ],
);

export type SavedFeedItem = typeof savedFeedItems.$inferSelect;
export type NewSavedFeedItem = typeof savedFeedItems.$inferInsert;
