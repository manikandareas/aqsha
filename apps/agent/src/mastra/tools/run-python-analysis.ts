import { AnalysisService } from "@aqsha/services/analysis";
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

/** Kredit codegen fallback (sama flat dengan `run_analysis`; §6 plan). */
const PYTHON_ANALYSIS_CREDITS = 10;

/**
 * run_python_analysis — FALLBACK codegen ber-guardrail (fase 4): jalankan kode Python bebas
 * saat katalog `list_analyses` TIDAK memuat permintaan. Sandbox `networkBlockAll` + timeout
 * ketat. Konvensi WAJIB: dataset sudah dimuat ke `df` (+ `DATA_PATH`), pandas/numpy/plt
 * tersedia; kode mengisi `result` = dict `{"tables": [...], "decisions": [...]}` (bentuk sama
 * `run_analysis` supaya terender sebagai tabel + kartu verdict); chart via `plt.show()`. Hasil
 * ditandai "analisis kustom" di UI (di luar katalog terverifikasi). Debit `sandbox_compute`
 * on-success; error runtime = `ok:false` (model boleh perbaiki, kredit tak terpotong).
 */
export const runPythonAnalysis = createTool({
  id: "run_python_analysis",
  description:
    "FALLBACK: jalankan kode Python analisis kustom terhadap dataset, HANYA bila list_analyses tidak memuat uji yang diminta. Coba list_analyses/run_analysis DULU. Kode dieksekusi di sandbox terisolasi (tanpa internet): dataset sudah tersedia sebagai DataFrame `df` (+ path `DATA_PATH`), pandas/numpy/matplotlib.pyplot(plt) siap. Kode HARUS mengisi variabel `result` = dict `{\"tables\": [{id,title,columns,rows,notes}], \"decisions\": [{id,label,rule,value,cutoff,verdict,interpretation}]}` (verdict: lolos/tidak_lolos/perhatian); buat grafik dengan plt.show(). Memakai kredit. Hasil ditandai 'analisis kustom (di luar katalog terverifikasi)'.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dataset (CSV/XLSX)."),
    title: z
      .string()
      .min(1)
      .describe("Judul singkat analisis kustom ini (mis. 'Indeks komposit & uji tren')."),
    code: z
      .string()
      .min(1)
      .describe(
        "Kode Python. `df`/`DATA_PATH`/pd/np/plt tersedia; isi `result` dict {tables, decisions}; chart via plt.show(). JANGAN akses jaringan.",
      ),
  }),
  execute: async (input, ctx) => {
    const scope = analysisScope(ctx);

    const gate = await precheckSandboxCompute(ctx, {
      ownerUserId: scope.ownerUserId,
      credits: PYTHON_ANALYSIS_CREDITS,
    });
    if (!gate.ok) return { ok: false as const, note: analysisBlockedNote(gate) };

    try {
      const run = await AnalysisService.runFreeformPython(getServiceDb(), {
        ...scope,
        artifactId: input.artifactId,
        code: input.code,
      });
      if (!run.ok) {
        return {
          ok: false as const,
          note: `${run.error.message}. Perbaiki kode lalu coba lagi (maks beberapa kali); kredit tidak dipotong.`,
          errorCode: run.error.code,
        };
      }

      const charged = await chargeSandboxCompute(ctx, {
        ownerUserId: scope.ownerUserId,
        credits: PYTHON_ANALYSIS_CREDITS,
        tool: "run_python_analysis",
      });
      if (!charged) {
        console.error(
          "[tools] run_python_analysis debit gagal pasca-sukses (race kuota) — hasil tetap dikembalikan",
        );
      }

      const { marker } = await finalizeStatsRun(ctx, {
        ownerUserId: scope.ownerUserId,
        analysis: "custom",
        title: input.title,
        result: run.result,
        charts: run.charts,
        custom: true,
        code: input.code,
      });
      return {
        ok: true as const,
        analysis: "custom" as const,
        result: run.result,
        chartCount: run.charts.length,
        ...(marker ? { marker } : {}),
        note: marker
          ? `Tulis interpretasi HANYA dari angka di result ini, lalu sisipkan ${marker} pada baris tersendiri tempat tabel & figur harus muncul. Sampaikan ke user bahwa ini analisis kustom di luar katalog terverifikasi.`
          : "Tulis interpretasi HANYA dari angka di result ini. Sampaikan ini analisis kustom di luar katalog terverifikasi.",
      };
    } catch (error) {
      return { ok: false as const, note: analysisFailureNote(error) };
    }
  },
});
