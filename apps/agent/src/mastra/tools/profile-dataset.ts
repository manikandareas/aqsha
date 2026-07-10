import { AnalysisService } from "@aqsha/services/analysis";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { analysisFailureNote, analysisScope } from "../lib/analysis";
import { getServiceDb } from "../lib/db";

/**
 * profile_dataset — profil skema dataset (CSV/XLSX di pustaka) via sandbox statistik.
 * READ, GRATIS (tanpa debit — onboarding analisis). Sandbox per-thread di-reuse;
 * dataset di-stage sekali (idempoten). Hasil = JSON kolom/tipe/missing/deteksi Likert
 * + preview — dasar untuk menyarankan pipeline uji & mapping kolom `run_analysis`.
 */
export const profileDataset = createTool({
  id: "profile_dataset",
  description:
    "Profil dataset tabular (CSV/XLSX) dari pustaka: kolom, tipe, missing, deteksi skala Likert, statistik dasar, preview baris. GRATIS. Jalankan SEBELUM menyarankan atau menjalankan analisis statistik apa pun.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dataset (dari lampiran user / list_artifacts)."),
  }),
  execute: async (input, ctx) => {
    const scope = analysisScope(ctx);
    try {
      const run = await AnalysisService.profileDataset(getServiceDb(), {
        ...scope,
        artifactId: input.artifactId,
      });
      if (!run.ok) return { ok: false as const, note: run.error.message };
      return { ok: true as const, profile: run.result };
    } catch (error) {
      return { ok: false as const, note: analysisFailureNote(error) };
    }
  },
});
