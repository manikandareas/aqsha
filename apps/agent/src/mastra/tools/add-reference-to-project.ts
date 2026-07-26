import type { CitationAuthor } from "@aqsha/db";
import { CitationLinkService } from "@aqsha/services/citations";
import { listProjectReferences, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/** "Sudirman, Ali; Watts, D." → entri CSL; nama tanpa koma disimpan apa adanya sebagai literal. */
function parseAuthors(raw: string): CitationAuthor[] {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => {
      const [family, given] = name.split(",").map((piece) => piece.trim());
      if (family && given) return { family, given };
      return { literal: name };
    });
}

/**
 * add_reference_to_project — WRITE. Menautkan sumber ke bib proyek dan mengembalikan `key` yang
 * dipakai compile. Dipanggil sesudah user setuju; tanpa langkah ini, `@key` yang ditulis agent
 * menjadi sitasi yatim karena entri bib-nya tak pernah ada.
 */
export const addReferenceToProject = createTool({
  id: "add_reference_to_project",
  description:
    "Tambahkan satu referensi ke bib proyek aktif lewat DOI, atau lewat metadata manual bila DOI tak ada. Mengembalikan `key` yang WAJIB dipakai sebagai `@key` di dokumen. Tawarkan dulu ke user dan tunggu persetujuannya sebelum memanggil tool ini.",
  inputSchema: z.object({
    doi: z.string().min(3).optional().describe("DOI sumber, mis. 10.1234/abcd."),
    manual: z
      .object({
        title: z.string().min(1),
        authors: z
          .string()
          .min(1)
          .describe("Nama penulis dipisah titik koma, mis. `Sudirman, Ali; Watts, Duncan`."),
        year: z.string().min(4).max(4),
        containerTitle: z.string().optional().describe("Nama jurnal/penerbit."),
        url: z.string().optional(),
      })
      .optional()
      .describe("Metadata manual; pakai hanya bila DOI tidak tersedia."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    if (!input.doi && !input.manual) {
      return { ok: false as const, message: "Sertakan `doi` atau `manual`." };
    }
    try {
      const created = input.doi
        ? await CitationLinkService.createInWorkspace(db, {
            ownerUserId,
            workspaceId,
            kind: "doi",
            doi: input.doi,
          })
        : await CitationLinkService.createInWorkspace(db, {
            ownerUserId,
            workspaceId,
            kind: "manual",
            fields: {
              title: input.manual!.title,
              authors: parseAuthors(input.manual!.authors),
              publishedYear: Number.parseInt(input.manual!.year, 10) || null,
              venue: input.manual!.containerTitle ?? null,
              url: input.manual!.url ?? null,
            },
          });
      const references = await listProjectReferences(db, { ownerUserId, workspaceId });
      // Key dibangkitkan server saat link dibuat; ambil dari daftar terkini agar selalu key nyata.
      const added = references.find((r) => r.citationId === created.id);
      return {
        ok: true as const,
        references,
        hint: added
          ? `Gunakan @${added.key} untuk mengutip sumber ini.`
          : "Referensi tertaut; panggil list_project_references untuk melihat key-nya.",
      };
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : "Referensi gagal ditambahkan ke proyek.",
      };
    }
  },
});
