import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * user_onboarding — 1:1 dengan users (dipaksa via `owner_user_id` sebagai PK).
 * Menyimpan jawaban wizard onboarding. `completed_at` != null = wizard selesai
 * (dipakai server-gate `/app`).
 */
export const userOnboarding = pgTable("user_onboarding", {
  ownerUserId: text("owner_user_id")
    .primaryKey()
    .references(() => users.ownerUserId),
  background: text("background").notNull(),
  interests: text("interests").array().notNull(),
  heardAboutSource: text("heard_about_source").notNull(),
  heardAboutOther: text("heard_about_other"),
  completedAt: bigint("completed_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export type UserOnboarding = typeof userOnboarding.$inferSelect;
export type NewUserOnboarding = typeof userOnboarding.$inferInsert;
