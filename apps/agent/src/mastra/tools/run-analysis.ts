import { AnalysisService, analysisCatalogEntry } from "@aqsha/services/analysis";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  analysisBlockedNote,
  analysisFailureNote,
  analysisScope,
  chargeSandboxCompute,
  finalizeStatsRun,
  precheckSandboxCompute,
} from "../lib/analysis";
import { getServiceDb } from "../lib/db";

/**
 * run_analysis — jalankan satu uji dari katalog terhadap dataset di sandbox
 * statistik. Debit `sandbox_compute` per-run: gate NON-consuming dulu (blocked =
 * pesan rapi tanpa charge), debit hanya SETELAH analisis sukses (idempoten per
 * toolCallId). Error mapping kolom = return `ok: false` supaya model mengoreksi
 * args (mis. setelah melihat profile_dataset), tanpa kehilangan kredit.
 */
export const runAnalysis = createTool({
  id: "run_analysis",
  description:
    "Jalankan SATU analisis statistik dari katalog (lihat list_analyses) terhadap dataset CSV/XLSX di pustaka. Hasil = tabel gaya output SPSS + decisions (verdict rule-based) sebagai JSON — semua angka dan kesimpulan lolos/tidak WAJIB diambil dari sini, jangan menghitung sendiri.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dataset (CSV/XLSX)."),
    analysis: z.string().min(1).describe("Id analisis dari list_analyses (mis. uji_validitas)."),
    args: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Argumen analisis sesuai spec di list_analyses (mapping kolom, opsi)."),
  }),
  execute: async (input, ctx) => {
    const scope = analysisScope(ctx);
    const entry = analysisCatalogEntry(input.analysis);
    if (!entry) {
      return {
        ok: false as const,
        note: `Analisis "${input.analysis}" tidak ada di katalog. Panggil list_analyses untuk id yang valid — jangan mengarang nama uji.`,
      };
    }

    if (entry.credits > 0) {
      const gate = await precheckSandboxCompute(ctx, {
        ownerUserId: scope.ownerUserId,
        credits: entry.credits,
      });
      if (!gate.ok) return { ok: false as const, note: analysisBlockedNote(gate) };
    }

    try {
      const run = await AnalysisService.runAnalysis(getServiceDb(), {
        ...scope,
        artifactId: input.artifactId,
        analysisId: entry.id,
        args: input.args ?? {},
      });
      if (!run.ok) {
        return {
          ok: false as const,
          note: `${run.error.message} Kredit tidak dipotong.`,
          errorCode: run.error.code,
        };
      }
      if (entry.credits > 0) {
        const charged = await chargeSandboxCompute(ctx, {
          ownerUserId: scope.ownerUserId,
          credits: entry.credits,
          tool: "run_analysis",
        });
        if (!charged) {
          console.error(
            "[tools] run_analysis debit gagal pasca-sukses analisis (race kuota) — hasil tetap dikembalikan",
          );
        }
      }

      // Bangun grup blok (tabel gaya SPSS + kartu verdict + figur PNG) lalu persist di
      // luar teks pesan (PNG tak lewat model — hemat token; FE me-join per-thread). Model
      // hanya menaruh penanda `marker` di narasi supaya tabel/figur muncul di posisi itu.
      const shortTitle = entry.title.replace(/\s*\(.*\)\s*$/, "");
      const { marker } = await finalizeStatsRun(ctx, {
        ownerUserId: scope.ownerUserId,
        analysis: entry.id,
        title: shortTitle,
        result: run.result,
        charts: run.charts,
      });
      return {
        ok: true as const,
        analysis: entry.id,
        result: run.result,
        // PNG chart TIDAK dikirim ke model (hemat token) — dirender FE dari blok tersimpan.
        chartCount: run.charts.length,
        // Penanda penempatan tabel/figur: tulis PERSIS pada baris tersendiri di posisi
        // hasil ini harus tampil. Tanpa penanda, tabel/figur di-append di akhir jawaban.
        ...(marker ? { marker } : {}),
        note: marker
          ? `Tulis interpretasi HANYA dari angka & decisions di result ini, lalu sisipkan ${marker} pada baris tersendiri tepat di tempat tabel & figur uji ini harus muncul.`
          : "Tulis interpretasi HANYA dari angka & decisions di result ini.",
      };
    } catch (error) {
      return { ok: false as const, note: analysisFailureNote(error) };
    }
  },
});
