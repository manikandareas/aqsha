import { type Db, throwAppError } from "@aqsha/db";
import { StorageService } from "../storage.service";
import { WorkspaceDocumentService } from "../workspace-document.service";
import { TypstCompileService } from "./compile.service";
import { composeProjectBib } from "./project-bib";
import type { TypstDiagnostic } from "./types";

export type PdfExportResult =
  | { ok: true; url: string }
  | { ok: false; errors: TypstDiagnostic[] };

export const WorkspacePdfExportService = {
  /**
   * Ekspor dokumen penuh → PDF via compile CLI Typst → blob StorageService → signed URL sementara.
   * Tidak ada tabel build: PDF dihasilkan on-demand. Error compile dikembalikan sebagai union
   * (produk, bukan throw) supaya UI menampilkan diagnostik. Owner divalidasi oleh getDocument.
   */
  async export(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<PdfExportResult> {
    const doc = await WorkspaceDocumentService.getDocument(db, input);
    if (!doc || !doc.source.trim()) {
      throwAppError({
        message: "Dokumen belum punya isi untuk diekspor",
        code: "document_empty",
        severity: "warning",
        status: 409,
      });
    }
    const bib = await composeProjectBib(db, input);
    const result = await TypstCompileService.compile({ mainTyp: doc!.source, bib });
    if (!result.ok) {
      return { ok: false, errors: result.errors };
    }
    const key = await StorageService.storeBytes(
      input.ownerUserId,
      input.workspaceId,
      "typst-pdf",
      result.pdf,
      "application/pdf",
    );
    return { ok: true, url: await StorageService.getSignedReadUrl(key) };
  },
};
