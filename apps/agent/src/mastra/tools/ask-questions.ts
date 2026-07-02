import type {
  AskQuestion,
  AskQuestionsResumeData,
  AskQuestionsSuspendPayload,
} from "@aqsha/chat-core";
import { formatAskAnswersForModel, renderAskQuestionsAsText } from "@aqsha/chat-core";
import { createTool } from "@mastra/core/tools";
import {
  askQuestionsInputSchema,
  askQuestionsResumeSchema,
  askQuestionsSuspendSchema,
} from "../lib/ask-questions-schema";

/**
 * ask_questions — HITL KLARIFIKASI (plural). Saat permintaan menuntut jawaban dalam tapi konteks
 * penting masih kurang, ajukan 1+ pertanyaan terstruktur SEKALIGUS lalu tunggu jawaban user
 * sebelum lanjut.
 *
 * Pola = tool-suspend native Mastra (sejajar built-in `ask_user`, tapi array): panggilan pertama
 * memanggil `context.agent.suspend({ questions })` → server memancarkan chunk `tool-call-suspended`
 * → FE merender kartu Questions (radio + "Lainnya…" / checkbox) di atas composer & panel kanan.
 * Setelah user menjawab / melewati, run di-resume dengan `context.agent.resumeData`
 * (AskQuestionsResumeData) → tool re-run mengembalikan jawaban ke model. Dipanggil di luar agent
 * (tanpa `suspend`) → fallback teks. TANPA write DB, TANPA debit (bagian dari turn chat yang sudah
 * tergerbang billing).
 */
export const askQuestions = createTool({
  id: "ask_questions",
  description:
    "Tanyakan 1+ pertanyaan klarifikasi terstruktur ke pengguna SEKALIGUS lalu tunggu jawabannya. Ini PENGECUALIAN, bukan default: hampir semua celah konteks diisi asumsi paling wajar (kerjakan langsung + sebutkan asumsi di jawaban) — bertanya HANYA bila ambiguitasnya material (jawaban berbeda mengubah arah secara mendasar) DAN tak ada default yang masuk akal. URUTAN: bila memang perlu bertanya, lakukan SEBELUM memanggil tool riset pertama (jangan buang budget riset ke scope yang salah). Bila kamu SUDAH riset di turn ini, WAJIB isi `findings` dengan ringkasan temuan relevan — hasil riset tak boleh terbuang. Jangan ulang pertanyaan yang sudah terjawab, apalagi menanyakan hal yang jawabannya sudah ada di hasil tool. Tiap pertanyaan `single` (pilih satu) atau `multi` (pilih beberapa), dengan opsi dan/atau `allowOther` (input bebas).",
  inputSchema: askQuestionsInputSchema,
  suspendSchema: askQuestionsSuspendSchema,
  resumeSchema: askQuestionsResumeSchema,
  execute: async (input, context) => {
    // `options` bawaan zod `.default([])` → tipe input opsional; normalisasi ke `AskQuestion[]`
    // (opsi selalu array) supaya cocok kontrak chat-core. No-op runtime (default sudah mengisi []).
    const questions: AskQuestion[] = input.questions.map((q) => ({ ...q, options: q.options ?? [] }));
    const findings = input.findings?.trim() || undefined;
    // Re-run setelah resume: kembalikan jawaban (atau catatan skip) ke model sebagai teks.
    // `findings` diikutkan lagi (TOOL-3) → temuan pra-klarifikasi tetap menempel pada langkah
    // lanjutan walau payload tool di history kelak di-elide (CTX-6) — jangan riset ulang.
    const resumeData = context?.agent?.resumeData as AskQuestionsResumeData | undefined;
    if (resumeData !== undefined) {
      const answers = formatAskAnswersForModel(questions, resumeData);
      return {
        content: findings
          ? `${answers}\n\nTemuan parsial yang sudah kamu kumpulkan sebelum bertanya (PAKAI KEMBALI, jangan mengulang pencarian yang sama):\n${findings}`
          : answers,
      };
    }
    // Panggilan pertama dalam turn agent: pause & munculkan kartu (payload dibaca FE).
    const suspend = context?.agent?.suspend;
    if (suspend) {
      const payload: AskQuestionsSuspendPayload = findings ? { questions, findings } : { questions };
      await suspend(payload);
      return;
    }
    // Di luar agent (tak ada suspend): surface pertanyaan sebagai teks agar tetap terlihat.
    const rendered = renderAskQuestionsAsText(questions);
    return { content: findings ? `${findings}\n\n${rendered}` : rendered };
  },
});
