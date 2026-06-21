import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * admin_entitlements — override admin db-driven (selain env allowlist). Port V1
 * `adminEntitlements`. Dibaca `resolveAdminBillingOverride`; `enabled && isAdminEmail`
 * → admin. Owner-scoped 1:1 (owner_user_id PK).
 */
export const adminEntitlements = pgTable("admin_entitlements", {
  ownerUserId: text("owner_user_id")
    .primaryKey()
    .references(() => users.ownerUserId),
  email: text("email"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export type AdminEntitlement = typeof adminEntitlements.$inferSelect;
export type NewAdminEntitlement = typeof adminEntitlements.$inferInsert;
