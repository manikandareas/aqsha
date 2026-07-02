import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * user_agent_preferences — preferensi stabil user untuk Astra (IMP-2), 1:1 dengan users.
 *
 * Sumber kebenaran preferensi LINTAS-percakapan (bahasa jawaban, gaya sitasi, gaya jawaban,
 * instruksi kustom) — disuntik ke system prompt via dynamic instructions, BUKAN working memory
 * per-thread (yang dipelajari ulang tiap thread). Diisi dari Settings → Personalisasi atau tool
 * agent `update_preferences` (confirm-first). Semua kolom nullable: null = default (otomatis /
 * ikuti perilaku bawaan). Cap `custom_instruction` di-enforce service (500 char).
 */
export const userAgentPreferences = pgTable(
  "user_agent_preferences",
  {
    ownerUserId: text("owner_user_id")
      .primaryKey()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    answerLanguage: text("answer_language"),
    citationStyle: text("citation_style"),
    responseStyle: text("response_style"),
    customInstruction: text("custom_instruction"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "user_agent_preferences_answer_language_check",
      sql`${t.answerLanguage} is null or ${t.answerLanguage} in ('id', 'en')`,
    ),
    check(
      "user_agent_preferences_citation_style_check",
      sql`${t.citationStyle} is null or ${t.citationStyle} in ('apa7', 'mla', 'chicago', 'ieee', 'vancouver', 'harvard')`,
    ),
    check(
      "user_agent_preferences_response_style_check",
      sql`${t.responseStyle} is null or ${t.responseStyle} in ('ringkas', 'seimbang', 'lengkap')`,
    ),
  ],
);

export type UserAgentPreferences = typeof userAgentPreferences.$inferSelect;
export type NewUserAgentPreferences = typeof userAgentPreferences.$inferInsert;
