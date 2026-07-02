import type { ProcessInputStepArgs, ProcessInputStepResult, Processor } from "@mastra/core/processors";

/**
 * Anggaran langkah berdisiplin: nudge kecukupan bertahap + jaminan jawaban teks akhir
 * (pola resmi Mastra `agents/processors`, diperluas untuk TOOL-1/TOOL-6).
 *
 * Masalah yang dicegah (dua lapis):
 *
 * 1. **Turn senyap** — model lemah nyangkut memanggil tool berulang sampai budget step habis;
 *    bila step TERAKHIR masih tool-call, loop berhenti tanpa sintesis → respons kosong.
 * 2. **Boros tool call** (TOOL-1) — tanpa checkpoint, model baru "sadar berhenti" di step
 *    terakhir; Pro bisa belasan call untuk prompt sepele. Nudge kecukupan disuntik BERTAHAP
 *    (~40% dan ~70% budget) sehingga model menilai "bukti sudah cukup?" jauh sebelum mentok.
 *
 * Mekanisme per step (`processInputStep`):
 * - Step checkpoint (≈40%/70% budget): `sendSignal` reaktif ringan — nilai kecukupan bukti;
 *   cukup → tulis jawaban; belum → sebutkan gap spesifik dan batch query paralel sisanya.
 * - Step terakhir (`stepNumber >= maxSteps-1`): reminder "berhenti nge-tool, tulis final"
 *   DAN `toolChoice:"none"` (TOOL-6) — penegakan semantik, bukan sekadar harapan prompt:
 *   step terakhir DIPAKSA jadi langkah sintesis teks. (`isTaskComplete` scorer sengaja tak
 *   dipakai: satu call LLM tambahan per step = melawan tujuan efisiensinya sendiri;
 *   `prepareStep` tak dibutuhkan karena processor ini sudah bisa mengembalikan `toolChoice`.)
 *
 * Pakai `sendSignal` (append) → cache prompt aman.
 *
 * Coupling cap (CFG-10): `ProcessInputStepArgs` Mastra 1.47 TIDAK mengekspos `maxSteps`/`stopWhen`
 * efektif per-call, jadi cap runtime tak bisa diturunkan di sini. Kondisi `>=` (bukan `===`)
 * menjaga jalur final tetap kena bila caller MENAIKKAN `maxSteps` per-call — tak ada regresi
 * turn-senyap, TAPI sejak TOOL-6 jalur final juga memaksa `toolChoice:"none"`, sehingga seluruh
 * step ekstra di atas cap konstruktor berjalan TANPA tool (budget tambahan efektif hangus).
 * Caller yang MENURUNKAN cap membuat reminder tak pernah jalan. Kesimpulan: `maxSteps`
 * konstruktor WAJIB = `defaultOptions.maxSteps` agent (lihat `astra-lite.ts`), dan JANGAN kirim
 * `maxSteps` per-call yang berbeda — lebih besar = tool mati sejak cap, lebih kecil = turn senyap.
 */
export class EnsureFinalResponseProcessor implements Processor {
  readonly id = "ensure-final-response";

  private maxSteps: number;
  /** Step (0-based) tempat nudge kecukupan disuntik — dihitung dari budget, di luar step final. */
  private checkpoints: Set<number>;

  constructor(maxSteps: number) {
    this.maxSteps = maxSteps;
    this.checkpoints = new Set(
      [Math.floor(maxSteps * 0.4), Math.floor(maxSteps * 0.7)].filter(
        (s) => s > 0 && s < maxSteps - 1,
      ),
    );
  }

  async processInputStep({
    stepNumber,
    steps,
    sendSignal,
  }: ProcessInputStepArgs): Promise<ProcessInputStepResult | undefined> {
    if (stepNumber >= this.maxSteps - 1) {
      // Resume `ask_questions` bisa mendarat TEPAT di step final (klarifikasi dipanggil di step
      // maxSteps-2). Tool tetap diblokir — melepas blokade = loop bisa berhenti di tool-call tanpa
      // sintesis (bug turn-senyap yang justru dicegah processor ini) — tapi reminder-nya diganti:
      // jawab dari temuan terkumpul + klarifikasi user, dan nyatakan bagian yang belum terverifikasi.
      const resumedFromAsk = steps
        .at(-1)
        ?.toolCalls?.some((c) => c?.toolName === "ask_questions");
      await sendSignal?.({
        type: "reactive",
        contents: resumedFromAsk
          ? `This is your final step (step ${stepNumber + 1} of ${this.maxSteps}) and tool calls are disabled. ` +
            `The user just answered your clarification — apply their answer to the findings you already gathered and write the best final answer you can now. ` +
            `State explicitly which parts you could not re-verify under the clarified scope, so the user can follow up.`
          : `This is your final step (step ${stepNumber + 1} of ${this.maxSteps}). ` +
            `Do not call any more tools. Summarize what you have found and give the user a complete final answer now.`,
        attributes: { reason: "max-steps-reached", step: stepNumber + 1 },
      });
      // TOOL-6: tegakkan secara semantik — step terakhir tak boleh berupa tool-call.
      return { toolChoice: "none" };
    }

    if (this.checkpoints.has(stepNumber)) {
      await sendSignal?.({
        type: "reactive",
        contents:
          `Checkpoint (step ${stepNumber + 1} of ${this.maxSteps}): assess whether you can already finish — the evidence you have gathered is sufficient AND every action the user explicitly requested has been carried out. ` +
          `If so, stop calling tools and write the final answer now. ` +
          `If not, name the SPECIFIC remaining gap or pending action and cover it with one parallel batch of tool calls — do not repeat searches similar to ones you already ran.`,
        attributes: { reason: "sufficiency-checkpoint", step: stepNumber + 1 },
      });
    }
    return undefined;
  }
}
