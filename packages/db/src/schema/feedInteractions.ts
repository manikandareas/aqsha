import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { feedItems } from "./feedItems";
import { users } from "./users";

/**
 * feed_interactions — telemetri + sinyal minat (P4). Port V1 `feedInteractions`. Tiap
 * save/hide/research/open_evidence menulis satu baris (append-only). `kind` = text + CHECK.
 */
export const feedInteractions = pgTable(
  "feed_interactions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    feedItemId: text("feed_item_id")
      .notNull()
      .references(() => feedItems.id),
    kind: text("kind").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "feed_interactions_kind_check",
      sql`${t.kind} in ('save', 'hide', 'research', 'open_evidence')`,
    ),
    index("feed_interactions_by_owner_item_kind").on(t.ownerUserId, t.feedItemId, t.kind),
    index("feed_interactions_by_owner_created").on(t.ownerUserId, t.createdAt),
  ],
);

export type FeedInteraction = typeof feedInteractions.$inferSelect;
export type NewFeedInteraction = typeof feedInteractions.$inferInsert;
