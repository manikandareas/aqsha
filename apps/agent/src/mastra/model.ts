import { createOpenAI } from "@ai-sdk/openai";

/**
 * Model Lite Astra (Fase 0/1) — dipakai root agent (dan, nanti, subagent /deep).
 *
 * Provider OpenAI / gateway OpenAI-compatible (`OPENAI_BASE_URL`, mis. LiteLLM/OpenRouter).
 * Pakai Chat Completions (`.chat`) demi kompatibilitas gateway maksimal; model id via
 * `AQSHA_LITE_MODEL`. Berbeda dengan eve, Mastra TIDAK butuh `modelContextWindowTokens` —
 * batas context window ditegakkan oleh `TokenLimiter` processor (Fase 1), bukan compaction
 * yang me-resolve katalog dari model id. Jadi escape-hatch `AQSHA_LITE_CONTEXT_WINDOW` eve
 * tak lagi diperlukan di sini.
 *
 * Model `LanguageModelV4` (provider AI SDK v7 = `@ai-sdk/provider@4`) diterima native oleh
 * `MastraModelConfig`.
 */
const openai = createOpenAI({
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
});

export const liteModel = openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o");
