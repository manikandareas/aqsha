import { ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * get_document_outline — READ murah. Peta bab dokumen proyek tanpa isinya: level, baris, jumlah
 * kata, penanda bab kosong, plus ringkasan referensi & anotasi. Dipakai saat manifest awal turn
 * sudah usang (dokumen berubah di tengah percakapan), bukan sebagai langkah wajib tiap edit.
 */
export const getDocumentOutline = createTool({
  id: "get_document_outline",
  description:
    "Peta bab dokumen Typst proyek: judul, level, baris, jumlah kata, dan bab mana yang masih kosong, plus jumlah referensi dan sitasi yatim. Murah — panggil ini untuk orientasi, bukan get_document_source.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const facts = await ProjectFactsService.get(db, { ownerUserId, workspaceId });
    if (!facts) {
      return { ok: false as const, message: "Proyek tidak ditemukan." };
    }
    return {
      ok: true as const,
      workspaceId: facts.workspaceId,
      mainFileName: facts.mainFileName,
      contentVersion: facts.contentVersion,
      totalWords: facts.totalWords,
      headings: facts.headings,
      referenceCount: facts.referenceCount,
      orphanCiteKeys: facts.orphanCiteKeys,
      openAnnotationCount: facts.openAnnotationCount,
      pendingProposal: facts.pendingProposal,
    };
  },
});
