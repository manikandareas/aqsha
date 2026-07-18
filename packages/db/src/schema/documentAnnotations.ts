import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

export const ANNOTATION_KINDS = ["highlight", "pin"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const ANNOTATION_STATUSES = ["open", "sent", "resolved", "dismissed"] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

/** Kotak anchor ruang-PDF (point, origin kiri-atas halaman, skala viewport 1). Pin = 1 titik (w=h=0). */
export type AnnotationRect = { x: number; y: number; w: number; h: number };

/**
 * document_annotations — anotasi user di PDF bab (highlight seleksi teks / pin titik).
 * Anchor PDF di-map SEKALI ke sumber (`source_file`+`source_line`, SyncTeX inverse) saat create;
 * `source_version` = contentVersion yang ter-render build saat itu → pembaca mendeteksi anchor
 * basi dengan membandingkan versi, bukan reload buta. `source_line` null = anchor tak ter-map
 * (tetap berguna: `selected_text`+`note` cukup sebagai konteks agen).
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
    sectionId: text("section_id")
      .notNull()
      .references(() => workspaceSections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    page: integer("page").notNull(),
    rects: jsonb("rects").$type<AnnotationRect[]>().notNull(),
    selectedText: text("selected_text"),
    note: text("note"),
    sourceFile: text("source_file"),
    sourceLine: integer("source_line"),
    sourceVersion: integer("source_version").notNull(),
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
    index("document_annotations_by_section_status").on(t.sectionId, t.status),
    index("document_annotations_by_owner_section").on(t.ownerUserId, t.sectionId),
  ],
);

export type DocumentAnnotation = typeof documentAnnotations.$inferSelect;
export type NewDocumentAnnotation = typeof documentAnnotations.$inferInsert;
