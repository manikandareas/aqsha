import { createOpenAI } from "@ai-sdk/openai";

/**
 * "Fast model" — instance LLM TERPISAH & murah untuk tugas ringan Explore (saran kueri,
 * subtopik Pulse, analisis gap/tension). Sepenuhnya configurable via env, INDEPENDEN dari
 * provider agent utama supaya bisa diarahkan ke gateway/model murah sendiri:
 *
 *   AQSHA_FAST_MODEL_BASE_URL  — API URL (OpenAI-compatible). Fallback: OPENAI_BASE_URL.
 *   AQSHA_FAST_MODEL_API_KEY   — API key.                     Fallback: OPENAI_API_KEY.
 *   AQSHA_FAST_MODEL           — nama model.                  Default:  "gpt-4o-mini".
 *
 * OpenAI-compatible (createOpenAI) → bisa pakai gpt-5-nano, model gateway, dsb.
 */
let provider: ReturnType<typeof createOpenAI> | null = null;

export function getFastModelProvider() {
  if (provider) return provider;
  const apiKey = process.env.AQSHA_FAST_MODEL_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseURL = process.env.AQSHA_FAST_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL;
  provider = createOpenAI({
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
  });
  return provider;
}

export const FAST_MODEL = process.env.AQSHA_FAST_MODEL ?? "gpt-4o-mini";

/** Model chat fast-model siap pakai (generateText/generateObject). */
export function fastModel() {
  return getFastModelProvider().chat(FAST_MODEL);
}
