import { bigint, boolean, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * analysis_result_blocks — blok hasil `run_analysis`/`run_python_analysis` (tabel
 * gaya SPSS + kartu verdict + figur PNG) yang dipersist di luar teks pesan (mig 0029).
 *
 * KENAPA di luar pesan: PNG chart Daytona TAK dikirim ke model (hemat token) dan base64
 * membengkakkan tiap load pesan → blok disimpan di sini, FE me-join per-thread. Model
 * hanya menaruh penanda `{{stats:<run_key>}}` di narasi; FE me-resolve penanda ke blok
 * HANYA bila `run_key` punya baris ASLI di sini (anti-pemalsuan: hanya tool yang menulis).
 *
 * `run_key` = toolCallId disanitasi (unik per pemanggilan tool dalam thread) → unique
 * `(thread_id, run_key)` membuat retry/re-run tool meng-upsert baris yang SAMA. `thread_id`
 * = id thread Mastra (plain text, pola `artifacts.thread_id`, tanpa FK ke chat_threads).
 * `blocks` = `StatsBlock[]` (kontrak `@aqsha/chat-core/stats-viz`; di-parse zod saat baca —
 * schema DB sengaja tak depend chat-core).
 */
export const analysisResultBlocks = pgTable(
  "analysis_result_blocks",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    runKey: text("run_key").notNull(),
    analysis: text("analysis").notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<unknown[]>().notNull(),
    // Codegen fallback (`run_python_analysis`, fase 4) → tandai "analisis kustom" + simpan kode
    // Python yang dieksekusi (auditability "Lihat kode"). `false`/null untuk hasil katalog.
    custom: boolean("custom").notNull().default(false),
    code: text("code"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("analysis_result_blocks_by_thread_run").on(t.threadId, t.runKey),
    index("analysis_result_blocks_by_thread").on(t.threadId, t.createdAt),
    index("analysis_result_blocks_by_owner_created").on(t.ownerUserId, t.createdAt),
  ],
);

export type AnalysisResultBlockRow = typeof analysisResultBlocks.$inferSelect;
export type NewAnalysisResultBlockRow = typeof analysisResultBlocks.$inferInsert;
