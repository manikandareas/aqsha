import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const ANNOTATION_KINDS = ["highlight", "pin"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const ANNOTATION_STATUSES = ["open", "sent", "resolved", "dismissed"] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

/** Kotak anchor ruang-preview (point, origin kiri-atas halaman, skala 1). Pin = 1 titik (w=h=0). */
export type AnnotationRect = { x: number; y: number; w: number; h: number };

/**
 * document_annotations — anotasi user di preview dokumen (highlight seleksi teks / pin
 * titik) pada level proyek. Anchor = `selected_text` (kutipan persis) + `page` + `rects`
 * untuk render overlay; tidak ada pemetaan ke baris sumber (typst.ts tidak mengekspos
 * span→baris) — loop Astra memakai `selected_text` sebagai konteks + anchor edit.
 */
export const documentAnnotations = pgTable(
  "document_annotations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    page: integer("page").notNull(),
    rects: jsonb("rects").$type<AnnotationRect[]>().notNull(),
    selectedText: text("selected_text"),
    note: text("note"),
    status: text("status").notNull().default("open"),
    threadId: text("thread_id"),
    messageId: text("message_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("document_annotations_kind_check", sql`${t.kind} in ('highlight', 'pin')`),
    check(
      "document_annotations_status_check",
      sql`${t.status} in ('open', 'sent', 'resolved', 'dismissed')`,
    ),
    index("document_annotations_by_workspace_status").on(t.workspaceId, t.status),
    index("document_annotations_by_owner_workspace").on(t.ownerUserId, t.workspaceId),
  ],
);

export type DocumentAnnotation = typeof documentAnnotations.$inferSelect;
export type NewDocumentAnnotation = typeof documentAnnotations.$inferInsert;
