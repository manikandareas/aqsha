import {
  AgentPreferencesService,
  ANSWER_LANGUAGE_IDS,
  CITATION_STYLE_IDS,
  CUSTOM_INSTRUCTION_MAX_CHARS,
  RESPONSE_STYLE_IDS,
} from "@aqsha/services/preferences";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * update_preferences (IMP-2, Opsi C) — simpan preferensi STABIL user ke profil app
 * (`user_agent_preferences`) saat ia mengungkapkannya di chat ("mulai sekarang jawab in English",
 * "pakai IEEE ya"). WRITE dgn konfirmasi percakapan (sejajar create_workspace dkk. — tawarkan
 * dulu, tunggu jawaban eksplisit). Profil = SoT lintas-percakapan; disuntik dynamic instructions
 * tiap turn, dan tetap bisa diubah user di Settings → Personalisasi.
 */
export const updatePreferences = createTool({
  id: "update_preferences",
  description:
    "Simpan preferensi STABIL pengguna ke profilnya (berlaku di SEMUA percakapan, juga bisa diubah di Settings → Personalisasi): bahasa jawaban, gaya sitasi default, gaya jawaban, dan/atau instruksi kustom. Pakai HANYA saat pengguna menyatakan preferensi menetap (mis. \"mulai sekarang…\", \"selalu…\") DAN sudah mengonfirmasi ingin disimpan — permintaan sekali-pakai untuk percakapan ini cukup diikuti tanpa tool ini. Kirim hanya field yang berubah; nilai null mengembalikan field itu ke default.",
  inputSchema: z
    .object({
      answerLanguage: z
        .enum(ANSWER_LANGUAGE_IDS)
        .nullable()
        .optional()
        .describe("Bahasa jawaban default: 'id' | 'en'; null = otomatis mengikuti pengguna."),
      citationStyle: z
        .enum(CITATION_STYLE_IDS)
        .nullable()
        .optional()
        .describe("Gaya sitasi default (apa7/mla/chicago/ieee/vancouver/harvard); null = default."),
      responseStyle: z
        .enum(RESPONSE_STYLE_IDS)
        .nullable()
        .optional()
        .describe("Gaya jawaban: ringkas | seimbang | lengkap; null = default."),
      customInstruction: z
        .string()
        .max(CUSTOM_INSTRUCTION_MAX_CHARS)
        .nullable()
        .optional()
        .describe(
          `Instruksi kustom menetap dari pengguna (maks ${CUSTOM_INSTRUCTION_MAX_CHARS} char, MENIMPA yang lama — gabungkan dgn isi lama bila pengguna menambah); null = hapus.`,
        ),
    })
    .refine(
      (v) =>
        v.answerLanguage !== undefined ||
        v.citationStyle !== undefined ||
        v.responseStyle !== undefined ||
        v.customInstruction !== undefined,
      { message: "Kirim minimal satu field preferensi." },
    ),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const saved = await AgentPreferencesService.update(getServiceDb(), ownerUserId, input);
    return {
      ok: true as const,
      preferences: saved,
      note: "Preferensi tersimpan di profil — berlaku mulai giliran berikutnya di semua percakapan.",
    };
  },
});
