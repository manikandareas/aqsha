import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

/** Shape error compile (salinan lokal — db tidak boleh depend ke @aqsha/services). */
export type LatexBuildErrorItem = {
  line: number | null;
  message: string;
  severity: "error" | "warning";
};

/**
 * latex_builds — hasil compile TERAKHIR per scope (latest-only): satu baris per bab
 * (`section_id` terisi) + satu baris full-document per proyek (`section_id` null).
 * `source_versions` = peta sectionId→contentVersion yang ter-compile, supaya pembaca
 * selalu bisa mendeteksi build basi tanpa reload buta. Saat status='error', pdf/synctex
 * key MEMPERTAHANKAN build sukses terakhir (viewer tetap punya PDF; errors/log_tail
 * menjelaskan kegagalan terbaru).
 */
export const latexBuilds = pgTable(
  "latex_builds",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => workspaceSections.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    pdfR2Key: text("pdf_r2_key"),
    synctexR2Key: text("synctex_r2_key"),
    errors: jsonb("errors").$type<LatexBuildErrorItem[]>(),
    logTail: text("log_tail"),
    sourceVersions: jsonb("source_versions").$type<Record<string, number>>().notNull(),
    builtAt: bigint("built_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("latex_builds_status_check", sql`${t.status} in ('ok', 'error')`),
    uniqueIndex("latex_builds_by_section").on(t.sectionId).where(sql`${t.sectionId} is not null`),
    uniqueIndex("latex_builds_full_by_workspace")
      .on(t.workspaceId)
      .where(sql`${t.sectionId} is null`),
  ],
);

export type LatexBuild = typeof latexBuilds.$inferSelect;
export type NewLatexBuild = typeof latexBuilds.$inferInsert;
