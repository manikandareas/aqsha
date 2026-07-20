import {
  type AnnotationKind,
  type AnnotationRect,
  type AnnotationStatus,
  type Db,
  type DbOrTx,
  type DocumentAnnotation,
  DocumentAnnotationRepo,
  throwAppError,
} from "@aqsha/db";
import { WorkspaceService } from "./workspace.service";

export type AnnotationView = {
  id: string;
  kind: AnnotationKind;
  page: number;
  rects: AnnotationRect[];
  selectedText: string | null;
  note: string | null;
  status: AnnotationStatus;
  threadId: string | null;
  messageId: string | null;
  createdAt: number;
  updatedAt: number;
};

const ANNOTATION_NOTE_MAX = 2000;
const SELECTED_TEXT_MAX = 2000;

function toView(row: DocumentAnnotation): AnnotationView {
  return {
    id: row.id,
    kind: row.kind as AnnotationKind,
    page: row.page,
    rects: row.rects,
    selectedText: row.selectedText,
    note: row.note,
    status: row.status as AnnotationStatus,
    threadId: row.threadId,
    messageId: row.messageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertOwnedAnnotation(
  db: DbOrTx,
  ownerUserId: string,
  workspaceId: string,
  annotationId: string,
): Promise<DocumentAnnotation> {
  const row = await DocumentAnnotationRepo.findById(db, ownerUserId, annotationId);
  if (!row || row.workspaceId !== workspaceId) {
    throwAppError({
      message: "Anotasi tidak ditemukan",
      code: "annotation_not_found",
      severity: "warning",
      status: 404,
    });
  }
  return row;
}

/**
 * Anotasi level proyek atas preview dokumen Typst. Anchor = `selected_text` (kutipan persis) +
 * `page` + `rects` (overlay). Tidak ada pemetaan ke baris sumber (typst.ts tak mengekspos
 * span→baris); loop Astra memakai `selected_text` sebagai konteks + anchor edit (`edits.oldText`).
 */
export const AnnotationService = {
  async create(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      kind: AnnotationKind;
      page: number;
      rects: AnnotationRect[];
      selectedText?: string | null;
      note?: string | null;
    },
  ): Promise<AnnotationView> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    if (input.rects.length === 0 || input.page < 1) {
      throwAppError({
        message: "Anchor anotasi tidak valid",
        code: "annotation_invalid_anchor",
        severity: "warning",
        status: 422,
      });
    }
    if ((input.note ?? "").length > ANNOTATION_NOTE_MAX) {
      throwAppError({
        message: "Catatan anotasi terlalu panjang",
        code: "annotation_note_too_long",
        severity: "warning",
        status: 413,
      });
    }
    const now = Date.now();
    const row: DocumentAnnotation = {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      kind: input.kind,
      page: input.page,
      rects: input.rects,
      selectedText: input.selectedText?.slice(0, SELECTED_TEXT_MAX) ?? null,
      note: input.note ?? null,
      status: "open",
      threadId: null,
      messageId: null,
      createdAt: now,
      updatedAt: now,
    };
    await DocumentAnnotationRepo.insert(db, row);
    return toView(row);
  },

  async list(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<AnnotationView[]> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const rows = await DocumentAnnotationRepo.listByWorkspace(db, input.ownerUserId, input.workspaceId);
    return rows.map(toView);
  },

  /** Ubah catatan / transisi status oleh user (hanya `open` ⇄ `dismissed`; `resolved`/`sent` = jalur service). */
  async update(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      annotationId: string;
      note?: string | null;
      status?: "open" | "dismissed";
    },
  ): Promise<AnnotationView> {
    const row = await assertOwnedAnnotation(
      db,
      input.ownerUserId,
      input.workspaceId,
      input.annotationId,
    );
    if ((input.note ?? "").length > ANNOTATION_NOTE_MAX) {
      throwAppError({
        message: "Catatan anotasi terlalu panjang",
        code: "annotation_note_too_long",
        severity: "warning",
        status: 413,
      });
    }
    const patch = {
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: Date.now(),
    };
    await DocumentAnnotationRepo.updateById(db, row.id, patch);
    return toView({ ...row, ...patch });
  },

  async remove(
    db: Db,
    input: { ownerUserId: string; workspaceId: string; annotationId: string },
  ): Promise<{ ok: true }> {
    const row = await assertOwnedAnnotation(
      db,
      input.ownerUserId,
      input.workspaceId,
      input.annotationId,
    );
    await DocumentAnnotationRepo.deleteById(db, row.id);
    return { ok: true };
  },

  /** Tandai anotasi terkirim ke thread (dipanggil klien setelah pesan berangkat via proxy Mastra). */
  async markSent(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      ids: string[];
      threadId: string;
      messageId?: string | null;
    },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, input.ids, {
      status: "sent",
      threadId: input.threadId,
      messageId: input.messageId ?? null,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
};
