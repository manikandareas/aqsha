import { throwAppError, UserAgentPreferencesRepo } from "@aqsha/db";
import type { DbOrTx } from "@aqsha/db";

/**
 * AgentPreferencesService (IMP-2) — preferensi stabil user untuk Astra (SoT: tabel
 * `user_agent_preferences`). Dibaca dynamic instructions agent tiap turn (lintas-thread,
 * menghormati keputusan no cross-thread recall: ini data profil eksplisit, bukan recall
 * percakapan) dan ditulis dari Settings → Personalisasi atau tool `update_preferences`.
 */

export const ANSWER_LANGUAGE_IDS = ["id", "en"] as const;
export const CITATION_STYLE_IDS = ["apa7", "mla", "chicago", "ieee", "vancouver", "harvard"] as const;
export const RESPONSE_STYLE_IDS = ["ringkas", "seimbang", "lengkap"] as const;
export const CUSTOM_INSTRUCTION_MAX_CHARS = 500;

export type AnswerLanguage = (typeof ANSWER_LANGUAGE_IDS)[number];
export type CitationStyle = (typeof CITATION_STYLE_IDS)[number];
export type ResponseStyle = (typeof RESPONSE_STYLE_IDS)[number];

/** Read model preferensi — null = default (otomatis / perilaku bawaan Astra). */
export type AgentPreferences = {
  answerLanguage: AnswerLanguage | null;
  citationStyle: CitationStyle | null;
  responseStyle: ResponseStyle | null;
  customInstruction: string | null;
};

/** Patch preferensi — field absen tak disentuh; null / "" = kembalikan ke default. */
export type AgentPreferencesPatch = {
  answerLanguage?: string | null;
  citationStyle?: string | null;
  responseStyle?: string | null;
  customInstruction?: string | null;
};

const EMPTY_PREFERENCES: AgentPreferences = {
  answerLanguage: null,
  citationStyle: null,
  responseStyle: null,
  customInstruction: null,
};

function normalizeEnum<T extends string>(
  value: string | null | undefined,
  ids: readonly T[],
  field: string,
): T | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if ((ids as readonly string[]).includes(value)) return value as T;
  throwAppError({
    code: "preference_invalid",
    message: `Nilai preferensi tidak dikenal untuk ${field}.`,
    field,
  });
}

export const AgentPreferencesService = {
  /** Soft: belum ada baris = semua default (null). */
  async get(db: DbOrTx, ownerUserId: string): Promise<AgentPreferences> {
    const row = await UserAgentPreferencesRepo.findByOwner(db, ownerUserId);
    if (!row) return { ...EMPTY_PREFERENCES };
    return {
      answerLanguage: (row.answerLanguage as AnswerLanguage | null) ?? null,
      citationStyle: (row.citationStyle as CitationStyle | null) ?? null,
      responseStyle: (row.responseStyle as ResponseStyle | null) ?? null,
      customInstruction: row.customInstruction,
    };
  },

  /**
   * PATCH: hanya field yang dikirim yang berubah; null/"" = reset ke default. Enum divalidasi
   * di sini (kode error kontrak) — CHECK constraint DB hanya jaring pengaman.
   */
  async update(
    db: DbOrTx,
    ownerUserId: string,
    patch: AgentPreferencesPatch,
  ): Promise<AgentPreferences> {
    const set: Parameters<typeof UserAgentPreferencesRepo.upsertPatch>[2] = {};
    const answerLanguage = normalizeEnum(patch.answerLanguage, ANSWER_LANGUAGE_IDS, "answerLanguage");
    if (answerLanguage !== undefined) set.answerLanguage = answerLanguage;
    const citationStyle = normalizeEnum(patch.citationStyle, CITATION_STYLE_IDS, "citationStyle");
    if (citationStyle !== undefined) set.citationStyle = citationStyle;
    const responseStyle = normalizeEnum(patch.responseStyle, RESPONSE_STYLE_IDS, "responseStyle");
    if (responseStyle !== undefined) set.responseStyle = responseStyle;
    if (patch.customInstruction !== undefined) {
      const trimmed = patch.customInstruction?.trim() ?? "";
      if (trimmed.length > CUSTOM_INSTRUCTION_MAX_CHARS) {
        throwAppError({
          code: "preference_too_long",
          message: `Instruksi kustom maksimal ${CUSTOM_INSTRUCTION_MAX_CHARS} karakter.`,
          field: "customInstruction",
        });
      }
      set.customInstruction = trimmed || null;
    }
    if (Object.keys(set).length > 0) {
      await UserAgentPreferencesRepo.upsertPatch(db, ownerUserId, set, Date.now());
    }
    return this.get(db, ownerUserId);
  },
};
