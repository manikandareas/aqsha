import { ANALYSIS_CATALOG } from "@aqsha/services/analysis";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * list_analyses — katalog uji statistik terverifikasi (template deterministik
 * `aqsha_stats`, angka match SPSS). Tanpa sandbox/DB/debit. Model WAJIB memilih
 * id dari sini (tidak mengarang nama uji) sebelum memanggil `run_analysis`.
 */
export const listAnalyses = createTool({
  id: "list_analyses",
  description:
    "Daftar analisis statistik yang tersedia di katalog terverifikasi (id, kegunaan, argumen wajib, kredit). Panggil sebelum run_analysis untuk memilih id + menyusun args yang benar.",
  inputSchema: z.object({}),
  execute: async () => ({
    analyses: ANALYSIS_CATALOG.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      credits: entry.credits,
      args: entry.args.map((arg) => ({
        name: arg.name,
        type: arg.type,
        ...(arg.values ? { values: arg.values } : {}),
        required: arg.required,
        description: arg.description,
      })),
    })),
    note: "Semua angka dihitung template Python deterministik (seed tetap) — verdict lolos/tidak sudah termasuk. Jangan menulis angka statistik yang tidak berasal dari hasil run_analysis.",
  }),
});
