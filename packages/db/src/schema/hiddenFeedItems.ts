import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { feedItems } from "./feedItems";
import { users } from "./users";

/**
 * hidden_feed_items — item yang di-hide owner (P4). Port V1 `hiddenFeedItems`. Hide
 * memfilter item dari feed/search masa depan. Unique (owner, feed_item) idempotent.
 */
export const hiddenFeedItems = pgTable(
  "hidden_feed_items",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItems.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("hidden_feed_items_by_owner_item").on(t.ownerUserId, t.feedItemId),
    index("hidden_feed_items_by_owner_created").on(t.ownerUserId, t.createdAt),
  ],
);

export type HiddenFeedItem = typeof hiddenFeedItems.$inferSelect;
export type NewHiddenFeedItem = typeof hiddenFeedItems.$inferInsert;
