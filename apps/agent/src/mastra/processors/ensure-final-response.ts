import type { ProcessInputStepArgs, Processor } from "@mastra/core/processors";

/**
 * Jamin jawaban teks akhir saat `maxSteps` tercapai (pola resmi Mastra `agents/processors`).
 *
 * Masalah yang dicegah: model lemah bisa nyangkut memanggil tool berulang (mis. `search_web`)
 * sampai budget step habis; bila step TERAKHIR masih berupa tool-call, loop berhenti tanpa
 * langkah sintesis → respons kosong (turn senyap). Processor ini menyuntik `<system-reminder>`
 * REAKTIF pada step terakhir (`stepNumber === maxSteps - 1`) yang menyuruh model berhenti
 * nge-tool dan langsung menulis jawaban final. Pakai `sendSignal` (append) → cache prompt aman.
 *
 * `maxSteps` di sini WAJIB sama dengan `maxSteps` pada opsi stream/generate agent (lihat
 * `astra-lite.ts` → `defaultOptions.maxSteps`), supaya reminder mendarat tepat di step pamungkas.
 */
export class EnsureFinalResponseProcessor implements Processor {
  readonly id = "ensure-final-response";

  private maxSteps: number;

  constructor(maxSteps: number) {
    this.maxSteps = maxSteps;
  }

  async processInputStep({ stepNumber, sendSignal }: ProcessInputStepArgs) {
    if (stepNumber !== this.maxSteps - 1) {
      return;
    }

    await sendSignal?.({
      type: "reactive",
      contents:
        `This is your final step (step ${stepNumber + 1} of ${this.maxSteps}). ` +
        `Do not call any more tools. Summarize what you have found and give the user a complete final answer now.`,
      attributes: { reason: "max-steps-reached", step: stepNumber + 1 },
    });
  }
}
