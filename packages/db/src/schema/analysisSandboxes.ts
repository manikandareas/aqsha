import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * analysis_sandboxes — bookkeeping sandbox Daytona per-thread untuk analisis
 * statistik (mig 0028). 1 row per thread (unique) → sandbox di-reuse antar tool
 * call; Daytona = source of truth state (stopped/started), row ini hanya mencatat
 * id + dataset yang SUDAH di-stage supaya tidak re-upload (file persist across stop).
 * `id` (PK) di-generate aplikasi (`crypto.randomUUID()`); `thread_id` = id thread
 * Mastra (plain text, pola `artifacts.thread_id` — tanpa FK ke proyeksi chat_threads).
 */
export type StagedDataset = {
  artifactId: string;
  /** Path absolut file dataset di dalam sandbox. */
  path: string;
  fileName: string;
  stagedAt: number;
};

export const analysisSandboxes = pgTable(
  "analysis_sandboxes",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    sandboxId: text("sandbox_id").notNull(),
    status: text("status").notNull().default("active"),
    stagedDatasets: jsonb("staged_datasets").$type<StagedDataset[]>().notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    lastUsedAt: bigint("last_used_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("analysis_sandboxes_status_check", sql`${t.status} in ('active', 'deleted')`),
    uniqueIndex("analysis_sandboxes_by_thread").on(t.threadId),
    index("analysis_sandboxes_by_owner_last_used").on(t.ownerUserId, t.lastUsedAt),
  ],
);

export type AnalysisSandbox = typeof analysisSandboxes.$inferSelect;
export type NewAnalysisSandbox = typeof analysisSandboxes.$inferInsert;
