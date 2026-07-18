import { AnnotationService, SectionLatexService, SectionService } from "@aqsha/services";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * get_section_source — READ. Sumber LaTeX terkini sebuah bab + anotasi terbuka user
 * (teks terseleksi + baris sumber + catatan). WAJIB dipanggil sebelum propose_section_edit:
 * contentVersion yang dikembalikan adalah basis CAS proposal, dan kutipan `edits.oldText`
 * harus berasal dari sumber ini, bukan ingatan.
 */
export const getSectionSource = createTool({
  id: "get_section_source",
  description:
    "Baca sumber LaTeX terkini satu bab proyek + daftar anotasi terbuka user di PDF-nya (teks yang ditandai, baris sumber hasil pemetaan, dan catatan). Panggil ini SEBELUM mengusulkan suntingan; gunakan kutipan persis dari sumber ini sebagai anchor edits.",
  inputSchema: z.object({
    sectionId: z.string().min(1).describe("Id bab (workspace section)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    try {
      const section = await SectionService.assertSectionOwner(db, ownerUserId, input.sectionId);
      const doc = await SectionLatexService.getDocument(db, {
        ownerUserId,
        sectionId: input.sectionId,
      });
      const annotations = await AnnotationService.list(db, {
        ownerUserId,
        sectionId: input.sectionId,
      });
      return {
        ok: true as const,
        sectionId: section.id,
        sectionTitle: section.title,
        contentVersion: doc?.contentVersion ?? 0,
        source: doc?.source ?? "",
        openAnnotations: annotations
          .filter((a) => a.status === "open" || a.status === "sent")
          .map((a) => ({
            id: a.id,
            kind: a.kind,
            page: a.page,
            selectedText: a.selectedText,
            note: a.note,
            sourceLine: a.sourceLine,
          })),
      };
    } catch {
      return {
        ok: false as const,
        message: "Bab tidak ditemukan atau bukan milik pengguna.",
      };
    }
  },
});
