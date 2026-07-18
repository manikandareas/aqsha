import {
  type AnnotationKind,
  type AnnotationRect,
  type AnnotationStatus,
  type Db,
  type DbOrTx,
  type DocumentAnnotation,
  DocumentAnnotationRepo,
  LatexBuildRepo,
  throwAppError,
} from "@aqsha/db";
import { sectionFilePath } from "./latex/assembly.service";
import { parseSynctex, type SynctexData, synctexInverseLookupPdfPoint } from "./latex/synctex";
import { SectionLatexService } from "./section-latex.service";
import { SectionService } from "./section.service";
import { StorageService } from "./storage.service";

export type AnnotationView = {
  id: string;
  kind: AnnotationKind;
  page: number;
  rects: AnnotationRect[];
  selectedText: string | null;
  note: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  sourceVersion: number;
  status: AnnotationStatus;
  threadId: string | null;
  messageId: string | null;
  createdAt: number;
  updatedAt: number;
};

const ANNOTATION_NOTE_MAX = 2000;

// Parse synctex itu murah tapi tidak gratis; satu build dibuka berkali-kali saat user
// menganotasi beruntun → cache kecil ber-key build (builtAt membedakan konten upsert in-place).
const SYNCTEX_CACHE_MAX = 8;
const synctexCache = new Map<string, SynctexData>();

async function loadSynctex(buildKey: string, r2Key: string): Promise<SynctexData | null> {
  const cached = synctexCache.get(buildKey);
  if (cached) return cached;
  try {
    const bytes = await StorageService.readBytes(r2Key);
    const data = parseSynctex(bytes);
    if (synctexCache.size >= SYNCTEX_CACHE_MAX) {
      const oldest = synctexCache.keys().next().value;
      if (oldest !== undefined) synctexCache.delete(oldest);
    }
    synctexCache.set(buildKey, data);
    return data;
  } catch (err) {
    // Mapping best-effort: synctex hilang/korup tidak menggagalkan pembuatan anotasi.
    console.error("[annotation] synctex load failed", r2Key, err);
    return null;
  }
}

/** Titik anchor untuk lookup: pusat rect pertama (highlight) / titik pin. */
function anchorPoint(rects: AnnotationRect[]): { xPt: number; yPt: number } {
  const r = rects[0]!;
  return { xPt: r.x + r.w / 2, yPt: r.y + r.h / 2 };
}

function toView(row: DocumentAnnotation): AnnotationView {
  return {
    id: row.id,
    kind: row.kind as AnnotationKind,
    page: row.page,
    rects: row.rects,
    selectedText: row.selectedText,
    note: row.note,
    sourceFile: row.sourceFile,
    sourceLine: row.sourceLine,
    sourceVersion: row.sourceVersion,
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
  sectionId: string,
  annotationId: string,
): Promise<DocumentAnnotation> {
  const row = await DocumentAnnotationRepo.findById(db, ownerUserId, annotationId);
  if (!row || row.sectionId !== sectionId) {
    throwAppError({
      message: "Anotasi tidak ditemukan",
      code: "annotation_not_found",
      severity: "warning",
      status: 404,
    });
  }
  return row;
}

export const AnnotationService = {
  /**
   * Buat anotasi di PDF bab. Anchor di-map SEKALI ke (file, baris) sumber via SyncTeX inverse
   * pada build tersimpan; `source_version` = versi sumber yang ter-render build itu, sehingga
   * staleness terdeteksi dengan banding versi. Gagal map (tanpa synctex / di luar body bab)
   * BUKAN error — `selected_text` + `note` tetap konteks berguna bagi agen.
   */
  async create(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      kind: AnnotationKind;
      page: number;
      rects: AnnotationRect[];
      selectedText?: string | null;
      note?: string | null;
    },
  ): Promise<AnnotationView> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka digenerate otomatis dan tidak bisa dianotasi",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
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
    const build = await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId);
    if (!build || !build.pdfR2Key) {
      // Tak ada PDF ter-render = tak ada permukaan untuk dianotasi.
      throwAppError({
        message: "Bab belum punya PDF ter-compile untuk dianotasi",
        code: "section_build_not_found",
        severity: "warning",
        status: 409,
      });
    }
    const doc = await SectionLatexService.getDocument(db, {
      ownerUserId: input.ownerUserId,
      sectionId: input.sectionId,
    });
    if (!doc) {
      throwAppError({
        message: "Dokumen bab tidak ditemukan",
        code: "section_document_not_found",
        severity: "error",
        status: 404,
      });
    }

    let sourceFile: string | null = null;
    let sourceLine: number | null = null;
    if (build.synctexR2Key) {
      const data = await loadSynctex(`${build.id}:${build.builtAt}`, build.synctexR2Key);
      if (data) {
        const point = anchorPoint(input.rects);
        const hit = synctexInverseLookupPdfPoint(data, {
          page: input.page,
          xPt: point.xPt,
          yPt: point.yPt,
        });
        const bodyPath = sectionFilePath(input.sectionId);
        // Hanya terima atribusi ke file body bab — hit ke main.tex ter-generate tidak berguna
        // bagi agen (baris preamble/heading bukan sumber yang ia sunting).
        if (hit && hit.file.endsWith(bodyPath)) {
          sourceFile = bodyPath;
          sourceLine = hit.line;
        }
      }
    }

    const now = Date.now();
    const row: DocumentAnnotation = {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      workspaceId: section.workspaceId,
      sectionId: section.id,
      kind: input.kind,
      page: input.page,
      rects: input.rects,
      selectedText: input.selectedText?.slice(0, 2000) ?? null,
      note: input.note ?? null,
      sourceFile,
      sourceLine,
      sourceVersion: build.sourceVersions[section.id] ?? doc.contentVersion,
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
    input: { ownerUserId: string; sectionId: string },
  ): Promise<AnnotationView[]> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    const rows = await DocumentAnnotationRepo.listBySection(db, input.ownerUserId, input.sectionId);
    return rows.map(toView);
  },

  /** Ubah catatan / transisi status oleh user (hanya `open` ⇄ `dismissed`; `resolved`/`sent` = jalur service). */
  async update(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      annotationId: string;
      note?: string | null;
      status?: "open" | "dismissed";
    },
  ): Promise<AnnotationView> {
    const row = await assertOwnedAnnotation(
      db,
      input.ownerUserId,
      input.sectionId,
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
    input: { ownerUserId: string; sectionId: string; annotationId: string },
  ): Promise<{ ok: true }> {
    const row = await assertOwnedAnnotation(
      db,
      input.ownerUserId,
      input.sectionId,
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
      sectionId: string;
      ids: string[];
      threadId: string;
      messageId?: string | null;
    },
  ): Promise<{ ok: true }> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    await DocumentAnnotationRepo.updateStatusByIds(db, input.ownerUserId, input.ids, {
      status: "sent",
      threadId: input.threadId,
      messageId: input.messageId ?? null,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
};
