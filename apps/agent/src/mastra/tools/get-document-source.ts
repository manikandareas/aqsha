import { ChatThreadRepo } from "@aqsha/db";
import { AnnotationService, WorkspaceDocumentService } from "@aqsha/services";
import { DocumentProposalService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * get_document_source — READ. Sumber Typst terkini dokumen proyek + anotasi terbuka user di
 * preview (teks terseleksi + halaman + catatan). Proyek diambil implisit dari scope thread.
 * WAJIB dipanggil sebelum propose_document_edit: contentVersion yang dikembalikan adalah basis
 * CAS proposal, dan kutipan `edits.oldText` harus berasal dari sumber ini, bukan ingatan.
 */
export const getDocumentSource = createTool({
  id: "get_document_source",
  description:
    "Baca sumber Typst terkini dokumen proyek + daftar anotasi terbuka user di preview (teks yang ditandai, halaman, dan catatan). Panggil ini SEBELUM mengusulkan suntingan; gunakan kutipan persis dari sumber ini sebagai anchor edits.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    try {
      const thread = await ChatThreadRepo.findById(db, threadScopeId(ctx));
      if (!thread || thread.ownerUserId !== ownerUserId) {
        return { ok: false as const, message: "Proyek thread ini tidak ditemukan." };
      }
      const workspaceId = thread.workspaceId;
      const [doc, annotations, pending] = await Promise.all([
        WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId }),
        AnnotationService.list(db, { ownerUserId, workspaceId }),
        DocumentProposalService.getPending(db, { ownerUserId, workspaceId }),
      ]);
      return {
        ok: true as const,
        workspaceId,
        contentVersion: doc?.contentVersion ?? 0,
        source: doc?.source ?? "",
        pendingProposal: pending
          ? {
              id: pending.id,
              summary: pending.summary,
              hunkCount: pending.hunks.length,
              isStale: pending.isStale,
            }
          : null,
        openAnnotations: annotations
          .filter((a) => a.status === "open" || a.status === "sent")
          .map((a) => ({
            id: a.id,
            kind: a.kind,
            page: a.page,
            selectedText: a.selectedText,
            note: a.note,
          })),
      };
    } catch {
      return {
        ok: false as const,
        message: "Dokumen proyek tidak ditemukan atau bukan milik pengguna.",
      };
    }
  },
});
