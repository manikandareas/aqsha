import { createOpenAI } from "@ai-sdk/openai";

/**
 * Model Lite Astra — dipakai root agent DAN semua subagent. Satu sumber agar
 * escape hatch context-window tak drift: subagent yang lupa men-set-nya bikin eve
 * gagal compile compaction untuk model gateway kustom (regresi nyata Fase 7).
 *
 * Provider OpenAI: dukung OpenAI langsung (`OPENAI_API_KEY`) ATAU endpoint
 * OpenAI-compatible/gateway (`OPENAI_BASE_URL`, mis. OpenRouter/LiteLLM). Pakai Chat
 * Completions (`.chat`) demi kompatibilitas gateway maksimal. Model id via `AQSHA_LITE_MODEL`.
 *
 * Compaction eve (selalu on) butuh ukuran context window. eve me-resolve via katalog
 * AI Gateway dari model id — tapi `openai.chat(id)` membuat eve mencari `openai/<id>`
 * (prefix provider), TAK cocok slug katalog (mis. `deepseek/deepseek-v4-flash`) → lookup
 * gagal walau modelnya ada. `AQSHA_LITE_CONTEXT_WINDOW` (jumlah token) → eve pakai nilai
 * ini, lewati lookup. Kosong = biarkan katalog resolve (model OpenAI resmi mis. gpt-4o).
 */
const openai = createOpenAI(
  process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {},
);

const contextWindow = process.env.AQSHA_LITE_CONTEXT_WINDOW
  ? Number(process.env.AQSHA_LITE_CONTEXT_WINDOW)
  : undefined;

/** Spread ke `defineAgent`: `{ model, ...(modelContextWindowTokens bila di-set) }`. */
export const liteModel = {
  model: openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o"),
  ...(contextWindow ? { modelContextWindowTokens: contextWindow } : {}),
};
