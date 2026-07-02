import type {
  AskQuestion,
  AskQuestionsResumeData,
  AskQuestionsSuspendPayload,
} from "@aqsha/chat-core";
import { z } from "zod";

/**
 * Skema zod `ask_questions` — SSOT dipakai BERSAMA oleh tool chat (`tools/ask-questions.ts`) dan
 * step `clarify` workflow `/deep` (`workflows/deep-research.ts`), supaya bentuk pertanyaan +
 * suspend/resume identik di kedua jalur HITL. Tipe murni (untuk FE) tetap di `@aqsha/chat-core`;
 * asersi tipe di bawah menjaga skema zod & tipe chat-core tak divergen (drift = error compile).
 */

export const askOptionSchema = z.object({
  label: z.string().min(1).describe("Teks opsi (ini nilai yang dikembalikan saat dipilih)."),
  description: z.string().optional().describe("Penjelasan opsi (opsional, tak mengubah nilai)."),
});

export const askQuestionSchema = z.object({
  id: z.string().min(1).describe("Id unik & stabil per pertanyaan (dipakai memetakan jawaban)."),
  prompt: z.string().min(1).describe("Pertanyaan yang jelas & spesifik."),
  kind: z
    .enum(["single", "multi"])
    .describe("`single` = pilih satu (radio); `multi` = pilih beberapa (checkbox)."),
  options: z
    .array(askOptionSchema)
    .default([])
    .describe("Opsi terstruktur. Kosongkan HANYA untuk pertanyaan freeform murni (kind `single`)."),
  allowOther: z
    .boolean()
    .optional()
    .describe(
      "Set true untuk menambah opsi 'Lainnya…' (input bebas). Pakai INI untuk jawaban di luar opsi — JANGAN membuat opsi 'Lainnya'/'Other' manual di `options` (akan dobel).",
    ),
});

export const askQuestionsInputSchema = z.object({
  questions: z.array(askQuestionSchema).min(1).max(6).describe("Daftar pertanyaan klarifikasi (1-6)."),
  findings: z
    .string()
    .optional()
    .describe(
      "Ringkasan temuan parsial yang SUDAH kamu kumpulkan lewat tool di turn ini, relevan dgn pertanyaan user. WAJIB diisi bila kamu sudah memanggil tool riset sebelum bertanya (ditampilkan ke user di atas pertanyaan — hasil riset tak boleh terbuang). Kosongkan bila belum ada riset di turn ini.",
    ),
});

export const askQuestionsSuspendSchema = z.object({
  questions: z.array(askQuestionSchema),
  findings: z.string().optional(),
});

export const askQuestionsResumeSchema = z.union([
  z.object({
    action: z.literal("answered"),
    // `selected` WAJIB array (FE selalu mengirim, walau kosong) → tipe input tetap `string[]`
    // (bukan opsional) sehingga assignable ke `AskQuestionAnswer` tanpa normalisasi.
    answers: z.array(
      z.object({
        id: z.string(),
        selected: z.array(z.string()),
        other: z.string().optional(),
      }),
    ),
  }),
  z.object({ action: z.literal("skipped") }),
]);

// Asersi tipe: keluaran zod HARUS assignable ke tipe chat-core (SSOT tunggal).
type _CheckQuestion = z.infer<typeof askQuestionSchema> extends AskQuestion ? true : never;
type _CheckResume = z.infer<typeof askQuestionsResumeSchema> extends AskQuestionsResumeData
  ? true
  : never;
type _CheckSuspend = z.infer<typeof askQuestionsSuspendSchema> extends AskQuestionsSuspendPayload
  ? true
  : never;
const _assertSchemaTypes: [_CheckQuestion, _CheckResume, _CheckSuspend] = [true, true, true];
void _assertSchemaTypes;
