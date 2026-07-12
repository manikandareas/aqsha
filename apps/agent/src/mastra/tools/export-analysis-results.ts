import type { AnalysisExportFormat } from "@aqsha/services/analysis";
import { AnalysisService } from "@aqsha/services/analysis";
import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { analysisFailureNote, analysisScope } from "../lib/analysis";
import { getServiceDb } from "../lib/db";

const EXPORT_TITLE: Record<AnalysisExportFormat, string> = {
  docx: "Hasil Analisis Data (Word)",
  xlsx: "Tabel Hasil Analisis (Excel)",
  sav: "Dataset Olahan (SPSS)",
};

/**
 * export_analysis_results — susun hasil analisis thread menjadi file unduhan (fase 5) lalu
 * simpan sebagai artifact di pustaka user: `.docx` (tabel gaya SPSS + interpretasi Bab 4),
 * `.xlsx` (tabel mentah), `.sav` (dataset untuk SPSS — butuh `datasetArtifactId`). File dibangun
 * di sandbox dari hasil uji yang SUDAH dijalankan; jangan mengarang isi. Tanpa debit (deliverable).
 */
export const exportAnalysisResults = createTool({
  id: "export_analysis_results",
  description:
    "Susun hasil analisis yang SUDAH dijalankan di thread ini menjadi file unduhan tersimpan di pustaka: docx (tabel + interpretasi Bab 4), xlsx (tabel mentah), sav (dataset olahan untuk SPSS — wajib sertakan datasetArtifactId). Panggil setelah menjalankan uji-uji yang diminta. Gratis.",
  inputSchema: z
    .object({
      formats: z
        .array(z.enum(["docx", "xlsx", "sav"]))
        .min(1)
        .describe("Format file yang diminta (satu atau lebih)."),
      datasetArtifactId: z
        .string()
        .optional()
        .describe("Wajib bila formats memuat 'sav': id artifact dataset yang mau disimpan sebagai .sav."),
    })
    .superRefine((val, ctx) => {
      // `.sav` menulis ulang dataset → butuh datasetArtifactId non-kosong; tolak di schema
      // supaya permintaan yang memuat 'sav' tanpa dataset gagal cepat (docx/xlsx-only tetap lolos).
      if (val.formats.includes("sav") && !val.datasetArtifactId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["datasetArtifactId"],
          message: "datasetArtifactId wajib diisi (non-kosong) bila formats memuat 'sav'.",
        });
      }
    }),
  execute: async (input, ctx) => {
    const scope = analysisScope(ctx);
    try {
      const res = await AnalysisService.exportResults(getServiceDb(), {
        ...scope,
        formats: input.formats as AnalysisExportFormat[],
        datasetArtifactId: input.datasetArtifactId,
      });
      if (!res.ok) return { ok: false as const, note: res.error.message };

      // Tiap file = upload S3 + insert DB independen → paralel. allSettled (bukan all): satu
      // insert gagal TIDAK boleh membuang artifact yang SUDAH tersimpan (retry akan menduplikat).
      const settled = await Promise.allSettled(
        res.files.map(async (file) => {
          const created = await ArtifactService.createGeneratedFile(getServiceDb(), {
            ownerUserId: scope.ownerUserId,
            threadId: scope.threadId,
            bytes: file.bytes,
            fileName: file.fileName,
            mimeType: file.mimeType,
            artifactType: file.artifactType,
            title: EXPORT_TITLE[file.format],
          });
          return { artifactId: created.artifactId, format: file.format, fileName: file.fileName };
        }),
      );
      const artifacts = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
      const failedFiles = res.files
        .filter((_, i) => settled[i]?.status === "rejected")
        .map((f) => f.fileName);

      if (artifacts.length === 0) {
        return {
          ok: false as const,
          note: `Semua file gagal disimpan ke pustaka${failedFiles.length ? ` (${failedFiles.join(", ")})` : ""}. Coba lagi.`,
        };
      }
      const notes = [
        "File tersimpan di pustaka user (bisa diunduh & di-@mention). Sebutkan file apa saja yang dibuat; jangan mengarang isinya.",
      ];
      if (failedFiles.length > 0) notes.push(`Gagal disimpan (bisa dicoba ulang): ${failedFiles.join(", ")}.`);
      if (res.missingFormats?.length) {
        notes.push(`Format tak terbentuk (tak ada hasil relevan): ${res.missingFormats.join(", ")}.`);
      }
      return {
        ok: true as const,
        artifacts,
        ...(failedFiles.length > 0 ? { failedFiles } : {}),
        note: notes.join(" "),
      };
    } catch (error) {
      return { ok: false as const, note: analysisFailureNote(error) };
    }
  },
});
